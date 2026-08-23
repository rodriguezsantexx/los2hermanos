import { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import cors from 'cors';

dotenv.config();

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Inicializar Servidor Express para comunicarse con el panel web
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/send-message', async (req: any, res: any) => {
    try {
        const { telefono, mensaje } = req.body;
        if (!telefono || !mensaje) {
            return res.status(400).json({ error: 'Faltan datos (telefono, mensaje)' });
        }

        if (globalSock && botStatus === 'connected') {
            await globalSock.sendMessage(telefono, { text: mensaje });
            
            // Buscar chat_id
            const { data: chatData } = await supabase.from('whatsapp_chats').select('id').eq('telefono', telefono).single();
            if (chatData) {
                // Guardar el mensaje enviado manualmente
                await supabase.from('whatsapp_mensajes').insert({
                    chat_id: chatData.id,
                    es_bot: true,
                    mensaje: mensaje
                });
            }
            return res.json({ success: true });
        } else {
            return res.status(500).json({ error: 'WhatsApp no está conectado' });
        }
    } catch (err) {
        console.error('Error al enviar mensaje desde API:', err);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// Endpoint para ver el estado del bot desde el panel web
app.get('/api/status', (req: any, res: any) => {
    res.json({ status: botStatus, qr: currentQR });
});

// Endpoint para reiniciar la sesión (útil cuando se corrompen las llaves de seguridad)
app.post('/api/restart', (req: any, res: any) => {
    console.log('[API] Solicitud para reiniciar la sesión de WhatsApp');
    if (globalSock) {
        try {
            globalSock.ev.removeAllListeners();
            globalSock.end(undefined);
        } catch(e) {}
    }
    
    // Borrar credenciales corruptas
    try {
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        console.log('Carpeta auth_info_baileys borrada con éxito.');
    } catch(e) {
        console.error('No se pudo borrar auth_info_baileys:', e);
    }
    
    botStatus = 'disconnected';
    currentQR = '';
    
    // Reconectar en 2 segundos
    setTimeout(() => {
        connectToWhatsApp();
    }, 2000);
    
    res.json({ success: true, message: 'Reiniciando bot...' });
});

app.listen(3005, () => {
    console.log('Servidor de API interno corriendo en puerto 3005');
});
// Inicializamos el cliente de OpenAI configurado para OpenRouter
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Cliente de Groq para usar Whisper (transcripción de audio ultra rápida y gratuita)
const groq = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY || 'tu_clave_de_groq',
});

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

// Variable global para acceder al socket desde los eventos del sistema
let globalSock: any = null;
let botStatus: 'disconnected' | 'qr' | 'connected' = 'disconnected';
let currentQR: string = '';

// Historial de conversaciones en memoria
const conversationHistories: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

async function getDynamicSystemPrompt(): Promise<string> {
    let productosTexto = '';
    try {
        // Traemos los productos activos desde Supabase
        const { data, error } = await supabase
            .from('productos')
            .select('nombre, precio, unidad')
            .eq('estado', 'activo');
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            productosTexto = data.map((p: any) => `- ${p.nombre}: $${p.precio} ${p.unidad ? '(' + p.unidad + ')' : ''}`).join('\n');
        } else {
            productosTexto = '- No hay productos disponibles en este momento.';
        }
    } catch (err) {
        console.error('Error obteniendo productos de Supabase:', err);
        productosTexto = '- (Error al consultar el catálogo. Por favor dile al cliente que espere unos minutos).';
    }

    return `Eres el asistente virtual de "Los 2 Hermanos", una empresa de venta y reparto de gas, leña, carbón y alimentos.

*CATÁLOGO Y PRECIOS (Obtenidos en tiempo real de la Base de Datos):*
${productosTexto}

*ZONAS DE ENVÍO:*
- Casa Grande, Valle Hermoso, La Falda, Huerta Grande y Villa Giardino.
- Costo de envío: $2000 adicionales al pedido.

*INSTRUCCIONES CLAVE:*
1. Sé amable, conciso y utiliza expresiones argentinas sutiles y amigables.
2. Si el cliente quiere hacer un pedido, guíalo para que te dé: Producto, Cantidad, Dirección exacta (asegurándote que esté en nuestras zonas de envío) y Forma de pago.
3. NUNCA inventes precios. Usa estrictamente los precios de la lista de arriba, y recuérdale que el envío cuesta $2000 adicionales.
4. Si ves un mensaje diciendo que hubo un error con un audio, pídele amablemente que escriba su consulta.`;
}

async function getAIResponse(userPhone: string, userMessage: string): Promise<string> {
    // Si no existe historial para este usuario, lo inicializamos con el prompt del sistema
    if (!conversationHistories[userPhone]) {
        const systemPrompt = await getDynamicSystemPrompt();
        conversationHistories[userPhone] = [
            { role: 'system', content: systemPrompt }
        ];
    }

    // Añadimos el nuevo mensaje del usuario al historial
    conversationHistories[userPhone].push({ role: 'user', content: userMessage });

    try {
        const completion = await openai.chat.completions.create({
            model: OPENROUTER_MODEL,
            messages: conversationHistories[userPhone],
        });

        const reply = completion?.choices?.[0]?.message?.content || 'Lo siento, tuve un problema al procesar tu solicitud.';
        
        // Añadimos la respuesta del asistente al historial
        conversationHistories[userPhone].push({ role: 'assistant', content: reply });

        // Para evitar que el historial crezca infinitamente, mantenemos solo los últimos 15 mensajes
        if (conversationHistories[userPhone].length > 15) {
            // Preservamos el primer mensaje (system prompt) y los últimos 14
            conversationHistories[userPhone] = [
                conversationHistories[userPhone][0],
                ...conversationHistories[userPhone].slice(conversationHistories[userPhone].length - 14)
            ];
        }

        return reply;
    } catch (error) {
        console.error('Error al comunicarse con OpenRouter:', error);
        return 'Ocurrió un error al contactar al agente de IA. Por favor, intenta de nuevo más tarde.';
    }
}

async function connectToWhatsApp() {
    console.log('Iniciando conexión con WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        syncFullHistory: false // Evita descargar chats antiguos para mayor estabilidad
    });
    
    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n--- Escanea este QR con tu WhatsApp ---');
            qrcode.generate(qr, { small: true });
            botStatus = 'qr';
            currentQR = qr;
        }

        if (connection === 'close') {
            botStatus = 'disconnected';
            currentQR = '';
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando:', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('Sesión cerrada (Logged Out). Borrando credenciales...');
                try {
                    fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                } catch(e) {}
                // Volvemos a iniciar para generar nuevo QR
                setTimeout(() => connectToWhatsApp(), 2000);
            }
        } else if (connection === 'open') {
            botStatus = 'connected';
            currentQR = '';
            console.log('¡Conectado exitosamente a WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        // Loggear todos los upserts para debuggear por qué no detecta el mensaje
        console.log(`=== Nuevo evento de mensaje (type: ${m.type}) ===`);
        
        if (m.type !== 'notify') return; // Solo procesar mensajes nuevos

        const msg = m.messages[0];
        
        // Ignorar mensajes enviados por nosotros mismos y mensajes de estado
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
            console.log("Mensaje ignorado (sin contenido, propio o broadcast)");
            return;
        }

        const remoteJid = msg.key.remoteJid!;
        
        // Ignorar mensajes de grupos (terminan en @g.us)
        if (remoteJid.endsWith('@g.us')) return;
        
        // Extraer texto del mensaje (puede ser conversation o extendedTextMessage)
        let textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // Procesar mensajes de audio
        if (msg.message.audioMessage) {
            console.log(`Audio recibido de ${remoteJid}, transcribiendo...`);
            await sock.sendPresenceUpdate('recording', remoteJid);
            
            try {
                // Descargar el audio
                const buffer = await downloadMediaMessage(msg, 'buffer', { }, { 
                    logger: pino({ level: 'silent' }) as any,
                    reuploadRequest: sock.updateMediaMessage
                });
                
                const fileName = `/tmp/audio_${Date.now()}_${remoteJid.split('@')[0]}.ogg`;
                await writeFile(fileName, buffer);
                
                // Enviar a transcribir a Groq
                const transcription = await groq.audio.transcriptions.create({
                    file: fs.createReadStream(fileName),
                    model: 'whisper-large-v3',
                });
                
                textMessage = transcription.text;
                console.log(`Audio transcrito: "${textMessage}"`);
                
                // Borrar el archivo temporal
                fs.unlink(fileName, (err) => { if(err) console.error('Error borrando audio temporal:', err) });
                
            } catch (err) {
                console.error('Error procesando el audio:', err);
                textMessage = "(El cliente envió un audio pero ocurrió un error al escucharlo. Por favor, pídele amablemente que lo escriba porque tienes problemas técnicos).";
            }
        }

        if (textMessage) {
            console.log(`Mensaje recibido de ${remoteJid}: ${textMessage}`);

            // 1. Verificar o crear el chat en la base de datos
            let chatId = null;
            let modoIa = true;
            try {
                const { data: chatExistente, error: errorBusqueda } = await supabase.from('whatsapp_chats').select('id, modo_ia').eq('telefono', remoteJid).single();
                
                if (chatExistente) {
                    chatId = chatExistente.id;
                    modoIa = chatExistente.modo_ia;
                } else {
                    const { data: nuevoChat, error: errorInsert } = await supabase.from('whatsapp_chats').insert({
                        telefono: remoteJid,
                        nombre_contacto: msg.pushName || 'Desconocido',
                        modo_ia: true
                    }).select().single();
                    
                    if (errorInsert) {
                        console.error('Error insertando nuevo chat:', errorInsert);
                    }
                    
                    if (nuevoChat) {
                        chatId = nuevoChat.id;
                        modoIa = true;
                    }
                }

                // 2. Guardar el mensaje del usuario en la BD
                if (chatId) {
                    const { error: errorMsj } = await supabase.from('whatsapp_mensajes').insert({
                        chat_id: chatId,
                        es_bot: false,
                        mensaje: textMessage
                    });
                    if (errorMsj) console.error('Error insertando mensaje:', errorMsj);
                }
            } catch (err) {
                console.error('Error gestionando BD de chats:', err);
            }

            // 3. Responder solo si está en Modo IA
            if (modoIa) {
                // Enviar "Escribiendo..."
                await sock.sendPresenceUpdate('composing', remoteJid);

                // Obtener respuesta de la IA
                const replyText = await getAIResponse(remoteJid, textMessage);

                // Enviar respuesta al usuario
                await sock.sendMessage(remoteJid, { text: replyText });
                
                // Finalizar estado de "Escribiendo..."
                await sock.sendPresenceUpdate('paused', remoteJid);

                // Guardar la respuesta de la IA en la BD
                if (chatId) {
                    await supabase.from('whatsapp_mensajes').insert({
                        chat_id: chatId,
                        es_bot: true,
                        mensaje: replyText
                    });
                }
            } else {
                console.log(`Modo Humano activo para ${remoteJid}. La IA no responderá automáticamente.`);
            }
        }
    });
}

// Cierre seguro para evitar el error de sesión (Bad MAC) al presionar Ctrl+C
process.on('SIGINT', () => {
    console.log('\n[!] Apagando el bot de forma segura para no romper la sesión...');
    if (globalSock) {
        try {
            globalSock.ev.flush();
            globalSock.end(undefined);
        } catch (e) { }
    }
    setTimeout(() => {
        console.log('Sesión guardada correctamente. Hasta luego.');
        process.exit(0);
    }, 1500);
});

connectToWhatsApp();
