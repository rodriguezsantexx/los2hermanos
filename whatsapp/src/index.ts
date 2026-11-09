import { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
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

// Carpeta de persistencia para credenciales de Baileys (compatible con Railway Volumes)
const AUTH_FOLDER = process.env.AUTH_FOLDER || path.join(process.cwd(), 'auth_info_baileys');

// Inicializar Servidor Express para comunicarse con el panel web
const app = express();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://los2hermanos.up.railway.app,http://localhost:3000,http://localhost:3005')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // fallback tolerante si hay subdominio de preview, pero restringido por token en endpoints sensibles
        }
    }
}));
app.use(express.json());

// Middleware de autenticación para endpoints administrativos del bot
// Verifica el Bearer token de Supabase o una clave interna BOT_API_SECRET
async function requireAuth(req: any, res: any, next: any) {
    const botSecret = process.env.BOT_API_SECRET;
    const apiKeyHeader = req.headers['x-api-key'];
    if (botSecret && apiKeyHeader === botSecret) {
        return next();
    }

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token) {
            try {
                const { data, error } = await supabase.auth.getUser(token);
                if (!error && data?.user) {
                    return next();
                }
            } catch (e) {
                console.error('Error validando token en bot:', e);
            }
        }
    }

    // Permitir en desarrollo local desde localhost si no se envió token (ej. simulador CLI)
    const remoteIp = req.ip || req.connection?.remoteAddress || '';
    const isLocalhost = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
    if (isLocalhost && !process.env.RAILWAY_ENVIRONMENT) {
        return next();
    }

    return res.status(401).json({ error: 'No autorizado. Se requiere sesión activa.' });
}

// Helper para limpiar teléfono a solo dígitos (para tabla clientes / pedidos)
function cleanPhoneDigits(phone: string): string {
    return String(phone || '').replace(/@s\.whatsapp\.net$/i, '').replace(/[^0-9]/g, '');
}

app.post('/api/send-message', requireAuth, async (req: any, res: any) => {
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
            // Sincronizar también en memoria por si reactivan Modo IA enseguida
            if (conversationHistories[telefono]) {
                conversationHistories[telefono].push({ role: 'assistant', content: mensaje });
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

// Función compartida para procesar la respuesta de la IA (extraer fotos, confirmar pedido y actualizar historial)
async function processAIResponseAndConfirmOrder(telefono: string, rawReply: string): Promise<{ replyText: string; imagesToSend: string[] }> {
    let replyText = rawReply;
    const imagesToSend: string[] = [];

    const photoRegex = /\[FOTO_([^\]]+)\]/g;
    let match;
    while ((match = photoRegex.exec(replyText)) !== null) {
        const imgPath = match[1].trim();
        const imgUrl = `${FRONT_MEDIA_BASE_URL}/flyers/${imgPath}.jpeg`;
        imagesToSend.push(imgUrl);
        console.log(`[DEBUG] Imagen extraída: ${imgUrl}`);
    }
    // Eliminar todas las etiquetas de fotos del texto
    replyText = replyText.replace(/\[FOTO_([^\]]+)\]/g, '').trim();

    // Intercepción de [PEDIDO_CONFIRMADO] (tolerante a bloques markdown ```json)
    if (replyText.includes('[PEDIDO_CONFIRMADO]')) {
        try {
            let jsonStr = replyText.split('[PEDIDO_CONFIRMADO]')[1].trim();
            jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
            // Extraer desde el primer '{' hasta el último '}' por si el LLM agregó texto extra
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
            }

            const pedidoData = JSON.parse(jsonStr);
            pedidoData.telefono = cleanPhoneDigits(telefono);

            const backendRes = await fetch(`${BACKEND_BASE_URL}/api/pedidos/bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pedidoData)
            });

            const backendData = await backendRes.json();

            if (!backendRes.ok) {
                if (backendData.detail === "CERRADO_DOMINGO") {
                    replyText = "Lo siento, hoy domingo estamos cerrados. 😔 ¡Te esperamos mañana!";
                } else if (backendData.detail === "CERRADO_DEPOSITO") {
                    replyText = "Lo siento, nuestro local se encuentra cerrado en este momento. Nuestro horario para retiros es de Lunes a Sábado de 09:00 a 21:00 hs.";
                } else if (backendData.detail === "CERRADO_REPARTO") {
                    replyText = "Lo siento, actualmente no estamos en horario de reparto. 🛵 Nuestros horarios de envío son de Lunes a Sábado de 09:00 a 14:00 y de 17:00 a 20:30 hs.";
                } else if (typeof backendData.detail === "string" && backendData.detail.startsWith("AMBIGUEDAD_PRODUCTO:")) {
                    const parts = backendData.detail.split(":");
                    const buscado = parts[1] || "el producto";
                    const opciones = parts[2] ? parts[2].split(",") : [];
                    if (opciones.length > 0) {
                        replyText = `Para "${buscado}", tenemos varias opciones disponibles: ${opciones.join(" o ")}. ¿Cuál de ellas preferís?`;
                    } else {
                        replyText = `¿Me podrías confirmar con exactitud qué marca o tipo de "${buscado}" necesitás?`;
                    }
                } else if (typeof backendData.detail === "string" && backendData.detail.startsWith("PRODUCTO_NO_ENCONTRADO:")) {
                    const prodNom = backendData.detail.split(":")[1] || "uno de los productos";
                    replyText = `Disculpá, no pude identificar "${prodNom}" en nuestro catálogo actual. ¿Me podrías confirmar exactamente qué producto necesitás?`;
                } else if (typeof backendData.detail === "string" && backendData.detail.startsWith("STOCK_INSUFICIENTE:")) {
                    const parts = backendData.detail.split(":");
                    const prodNom = parts[1] || "el producto";
                    const disponible = parts[2] || "0";
                    replyText = `Lo siento, en este momento nos quedan solo ${disponible} unidades disponibles de "${prodNom}". ¿Querés que te preparemos esa cantidad o preferís otra opción?`;
                } else {
                    replyText = "Ocurrió un error al intentar registrar el pedido. Por favor, intentá de nuevo en unos momentos.";
                }
            } else if (backendData.mp_link) {
                replyText = `¡Pedido confirmado y guardado! 🚀\n\nPodés abonarlo escaneando o tocando el siguiente link de Mercado Pago:\n👉 ${backendData.mp_link}\n\nUna vez realizado, nuestro sistema lo detectará y el chofer saldrá para allá. ¡Muchas gracias!`;
            } else {
                const metodoPago = (pedidoData.metodo_pago || "").toLowerCase();
                if (metodoPago.includes("transferencia")) {
                    replyText = `¡Pedido confirmado y guardado! 🚀\n\nEl chofer llevará un código QR para que puedas abonar con transferencia en el momento de la entrega. ¡Gracias por elegir Los 2 Hermanos!`;
                } else {
                    replyText = `¡Pedido confirmado y guardado exitosamente! 🚀\n\nYa lo anoté en nuestro sistema y el chofer lo llevará a la brevedad. ¡Cualquier otra cosa que necesites, avisame!`;
                }
            }
        } catch (e) {
            console.error("Error parseando o enviando pedido:", e);
            replyText = "Ocurrió un error al intentar guardar tu pedido en el sistema. Por favor, intentá confirmarlo nuevamente en unos minutos.";
        }

        // Actualizar el último mensaje del asistente en memoria para que la IA sepa lo que realmente se le respondió al cliente (ej: desambiguación o falta de stock)
        const hist = conversationHistories[telefono];
        if (hist && hist.length > 0 && hist[hist.length - 1].role === 'assistant') {
            hist[hist.length - 1].content = replyText;
        }
    }

    return { replyText, imagesToSend };
}

// Endpoint para simular un mensaje entrante (ideal para pruebas sin celular)
app.post('/api/simulate-message', requireAuth, async (req: any, res: any) => {
    try {
        const { telefono, mensaje } = req.body;
        if (!telefono || !mensaje) {
            return res.status(400).json({ error: 'Faltan datos (telefono, mensaje)' });
        }

        console.log(`[SIMULADOR] Mensaje recibido de ${telefono}: ${mensaje}`);

        let chatId = null;
        let modoIa = true;
        try {
            const { data: chatExistente } = await supabase.from('whatsapp_chats').select('id, modo_ia').eq('telefono', telefono).single();
            if (chatExistente) {
                chatId = chatExistente.id;
                modoIa = chatExistente.modo_ia;
            } else {
                const { data: nuevoChat } = await supabase.from('whatsapp_chats').insert({
                    telefono: telefono,
                    nombre_contacto: 'Simulador',
                    modo_ia: true
                }).select().single();
                if (nuevoChat) {
                    chatId = nuevoChat.id;
                }
            }

            if (chatId) {
                await supabase.from('whatsapp_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
                await supabase.from('whatsapp_mensajes').insert({
                    chat_id: chatId,
                    es_bot: false,
                    mensaje: mensaje
                });
            }
        } catch (err) {
            console.error('Error guardando en BD desde simulador:', err);
        }

        if (modoIa) {
            const rawReply = await getAIResponse(telefono, mensaje, chatId);
            console.log(`[DEBUG-SIM] Respuesta IA (cruda): ${rawReply.substring(0, 500)}`);

            const { replyText, imagesToSend } = await processAIResponseAndConfirmOrder(telefono, rawReply);
            console.log(`[DEBUG-SIM] Tags extraídos: ${imagesToSend.length} | Texto limpio: ${replyText.substring(0, 300)}`);
            
            // Soportar múltiples burbujas de texto
            const textMessages = replyText.split('|||').map(m => m.trim()).filter(Boolean);
            const finalReply = textMessages.join('\n\n');
            
            if (chatId) {
                await supabase.from('whatsapp_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
                await supabase.from('whatsapp_mensajes').insert({
                    chat_id: chatId,
                    es_bot: true,
                    mensaje: finalReply
                });
            }
            return res.json({ success: true, reply: finalReply, images: imagesToSend });
        } else {
            return res.json({ success: true, reply: "[Modo Humano Activo] - La IA no respondió automáticamente." });
        }
    } catch (err) {
        console.error('Error en simulador:', err);
        return res.status(500).json({ error: 'Error interno en simulación' });
    }
});

// Endpoint para ver el estado del bot desde el panel web
app.get('/api/status', (req: any, res: any) => {
    res.json({
        status: botStatus,
        qr: currentQR,
        pairingCode: currentPairingCode,
        pairingPending: !!pendingPairingNumber
    });
});

// Endpoint para vincular mediante PAIRING CODE (para uso desde el celular,
// donde no se puede escanear un QR que aparece en la misma pantalla).
// El usuario ingresa SOLO su número local (ej: 3515554444) y acá le
// agregamos automáticamente el prefijo de celular argentino (549).
app.post('/api/pair', requireAuth, async (req: any, res: any) => {
    try {
        const { numero } = req.body;
        if (!numero) {
            return res.status(400).json({ error: 'Falta el campo numero' });
        }
        // Normalizar: eliminar espacios, guiones, signos '+'/'('-')'
        let limpio = String(numero).replace(/[^0-9]/g, '');
        // Agregar el prefijo 549 (celular argentino) si no viene completo
        if (limpio.startsWith('549')) {
            // ya está en formato completo
        } else if (limpio.startsWith('54')) {
            // 54 + área sin el 9 → insertar el 9 (y quitar 0 del área si lo trae)
            limpio = '549' + limpio.slice(2).replace(/^0/, '');
        } else {
            // formato local → quitar el 0 inicial del área y agregar 549
            limpio = '549' + limpio.replace(/^0/, '');
        }
        if (limpio.length < 11) {
            return res.status(400).json({ error: 'Numero inválido. Ejemplo: 3515554444' });
        }

        console.log('[API] Solicitando vinculo por Pairing Code para:', limpio);
        pendingPairingNumber = limpio;
        currentPairingCode = '';
        currentQR = '';

        // Reiniciamos la conexión SIEMPRE (aunque el socket esté en estado 'qr'),
        // para que el nuevo socket pida el pairing code durante su fase de QR.
        if (globalSock) {
            try {
                globalSock.ev.removeAllListeners();
                globalSock.end(undefined);
            } catch(e) {}
        }
        setTimeout(() => connectToWhatsApp(), 500);

        return res.json({ success: true, message: 'Vinculación por código iniciada.' });
    } catch (err) {
        console.error('Error en /api/pair:', err);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// Endpoint para reiniciar la sesión (útil cuando se corrompen las llaves de seguridad)
app.post('/api/restart', requireAuth, (req: any, res: any) => {
    console.log('[API] Solicitud para reiniciar la sesión de WhatsApp');
    if (globalSock) {
        try {
            globalSock.ev.removeAllListeners();
            globalSock.end(undefined);
        } catch(e) {}
    }
    
    // Borrar credenciales corruptas
    try {
        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        console.log(`Carpeta de credenciales (${AUTH_FOLDER}) borrada con éxito.`);
    } catch(e) {
        console.error('No se pudo borrar la carpeta de credenciales:', e);
    }
    
    botStatus = 'disconnected';
    currentQR = '';
    currentPairingCode = '';
    pendingPairingNumber = null;
    
    // Reconectar en 2 segundos
    setTimeout(() => {
        connectToWhatsApp();
    }, 1800);
    
    res.json({ success: true, message: 'Reiniciando bot...' });
});

app.post('/api/extract-order', requireAuth, async (req: any, res: any) => {
    try {
        const { chat_id, productos_disponibles, localidades_disponibles } = req.body;
        
        const { data: mensajes } = await supabase
            .from('whatsapp_mensajes')
            .select('es_bot, mensaje')
            .eq('chat_id', chat_id)
            .order('created_at', { ascending: false })
            .limit(20);
            
        if (!mensajes) return res.status(404).json({ error: 'Chat sin mensajes' });
        
        const historyText = mensajes.reverse().map((m: any) => `${m.es_bot ? 'Bot' : 'Cliente'}: ${m.mensaje}`).join('\n');
        
        const prompt = `Analiza esta conversación y extrae los datos del pedido en formato JSON estricto.
No incluyas markdown, solo JSON válido.
Estructura deseada:
{
  "direccion": "Calle y número si existe, extraído de la conversación. Si la casa no tiene número, anotar solo la calle. Si no hay dirección, dejar vacío",
  "localidad_id": "Compara la localidad mencionada y elige el ID correcto de esta lista (ignora mayusculas/minusculas). Lista: ${JSON.stringify(localidades_disponibles)}. Si no menciona ninguna o no coincide, dejar vacío",
  "metodo_pago": "Efectivo o Transferencia. Por defecto Efectivo si no dice nada.",
  "detalles": [
    {
       "producto_id": "Elige el ID correcto de esta lista: ${JSON.stringify(productos_disponibles.map((p:any) => ({id: p.id, nombre: p.nombre})))}",
       "cantidad": 1
    }
  ]
}

Conversación reciente:
${historyText}`;

        const completion = await groq.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'system', content: prompt }],
            response_format: { type: "json_object" }
        });

        const reply = completion?.choices?.[0]?.message?.content || '{}';
        
        // Limpiar posible markdown (ej. ```json ... ```)
        const cleanReply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanReply);
        
        return res.json(parsed);
    } catch (err) {
        console.error('Error extrayendo pedido:', err);
        return res.status(500).json({ error: 'Error interno de IA' });
    }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`Servidor de API interno corriendo en puerto ${PORT}`);
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

// URL base del backend de Python (FastAPI). Por defecto apunta a la instancia
// pública de Railway (producción). Para desarrollar en LOCAL, exportá
// BACKEND_BASE_URL=http://127.0.0.1:8000 antes de levantar el bot.
//
// Importante: NO dependemos de NODE_ENV porque muchos PaaS (incl. Railway) no
// garantizan setearlo a "production"; preferimos la URL estable por defecto y
// permitir sobrescribirla explícitamente.
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ||
    'https://backend-production-af7b3.up.railway.app';

// Origen público de los assets multimedia (flyers/imágenes de productos).
// Sirven desde la carpeta /public/flyers de la WEB. Parametrizable por env.
const FRONT_MEDIA_BASE_URL = process.env.FRONT_MEDIA_BASE_URL ||
    'https://los2hermanos.up.railway.app';

// Variable global para acceder al socket desde los eventos del sistema
let globalSock: any = null;
let botStatus: 'disconnected' | 'qr' | 'paired' | 'connected' = 'disconnected';
let currentQR: string = '';
let currentPairingCode: string = '';
let pendingPairingNumber: string | null = null;

// Historial de conversaciones en memoria
const conversationHistories: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

async function getDynamicSystemPrompt(): Promise<string> {
    let productosTexto = '';
    try {
        // Traemos los productos activos desde Supabase
        const { data, error } = await supabase
            .from('productos')
            .select('nombre, precio, categoria, marca, cantidad, unidad')
            .eq('estado', 'activo');
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            const byCategory: Record<string, any[]> = {};
            data.forEach((p: any) => {
                const cat = p.categoria || 'Otros';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(p);
            });

            const emojis: Record<string, string> = {
                'gas': '🔥',
                'leña': '🪵',
                'carbón': '🪨',
                'alimentos': '🛒',
                'agua': '💧',
                'otros': '📦'
            };
            
            const lineas = [];
            for (const [cat, prods] of Object.entries(byCategory)) {
                const catLower = cat.toLowerCase();
                const emoji = emojis[catLower] || '📦';
                lineas.push(`*[${cat.toUpperCase()}] ${emoji}*`);
                prods.forEach(p => {
                    const marcaStr = p.marca ? ` - ${p.marca}` : '';
                    const cantStr = p.cantidad ? ` - ${p.cantidad}` : '';
                    const uniStr = p.unidad ? ` ${p.unidad}` : '';
                    
                    let fotoStr = '';
                    // Función para limpiar tildes y eñes
                    const cleanStr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
                    
                    const cCat = cleanStr(catLower);
                    const idNombre = cleanStr(p.nombre || '').toLowerCase().trim().replace(/\s+/g, '_');
                    const idCantidad = cleanStr(`${p.cantidad || ''}${p.unidad || ''}`).toLowerCase().trim().replace(/\s+/g, '');
                    const idMarca = cleanStr(p.marca || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                    
                    const idPartes = [idNombre, idCantidad, idMarca].filter(Boolean).join('_');
                    const idFoto = `${cCat}/${idPartes}`;
                    fotoStr = ` (ID_FOTO: ${idFoto})`;
                    
                    lineas.push(`- ${p.nombre}${marcaStr}${cantStr}${uniStr}: $${p.precio}${fotoStr}`);
                });
                lineas.push(''); // Línea en blanco para separar categorías
            }
            productosTexto = lineas.join('\n').trim();
        } else {
            productosTexto = '- No hay productos disponibles en este momento.';
        }
    } catch (err) {
        console.error('Error obteniendo productos de Supabase:', err);
        productosTexto = '- (Error al consultar el catálogo. Por favor dile al cliente que espere unos minutos).';
    }

    return `Eres el asistente virtual de "Los 2 Hermanos", una empresa de venta y reparto de gas, leña, carbón y alimentos. Tu objetivo es tomar el pedido del cliente de forma ULTRA RÁPIDA, DIRECTA y SIMPLE asi informamos al cliente y nuestro chofer.

*CATÁLOGO Y PRECIOS (Obtenidos en tiempo real):*
${productosTexto}

*ZONAS DE ENVÍO:*
- Casa Grande, Valle Hermoso, La Falda, Huerta Grande y Villa Giardino.
(El envío ya está incluido en los precios del catálogo).

*HORARIOS DE ATENCIÓN:*
- Repartos (lunes a sábados): de 9:00 a 14:00hs y de 17:00 a 20:30hs.
- Depósito/Retiro por local: Corrido de 9:00 a 21:00hs.

*Tono y Actitud:*
- Amigable, casual y muy eficiente (como un cajero experimentado en hora pico).
- Respuestas cortas (máximo 2 o 3 oraciones por mensaje).
- NUNCA uses menús con números (ej: "Marca 1 para...").
- NUNCA hagas preguntas innecesarias ni te extiendas en saludos formales.
- Utiliza expresiones argentinas sutiles y amigables.

*FLUJO ESTRICTO DE VENTAS (Debes seguir este orden sin saltarte pasos):*
1. **PRODUCTOS:** Identifica qué productos quiere el cliente. SIEMPRE debes saludar primero. Si en su primer mensaje ya pide un producto (ej: "hola quiero una garrafa de 15 extragas"), salúdalo cortésmente y EN OTRO MENSAJE (separado por |||) avanza inmediatamente al paso 2.
2. **UBICACIÓN:** Una vez que sabes qué productos quiere, pregúntale: "¿Sería para envío a domicilio o retirás por el local?"
   - Si elige envío, pídele la dirección usando EXACTAMENTE este texto: "Dale. Para poder confirmar el pedido, mandame la dirección (calle y localidad), un link de Google Maps o el pin de ubicación."
   - IMPORTANTE SOBRE MAPAS/PINES: Si el cliente envía un link de Maps o un Pin pero NO escribe el nombre de la calle, DEBES preguntarle el nombre de la calle (ej: "¿Me podrías escribir el nombre de la calle para anotarlo en el ticket de envío?"). El ticket final NUNCA debe decir "dirección enviada" o "link", DEBE tener escrita la calle y la localidad para tranquilidad del cliente. IMPORTANTE: Muchas casas NO tienen número de calle. Si el cliente da solo el nombre de la calle (o un punto de referencia), es una dirección VÁLIDA: anotá la calle sin número (ej: "Calle Los Aromos, La Falda"). NUNCA rechaces ni insistas en pedir un número si la casa no lo tiene.
   - Compara su ubicación con las zonas de envío permitidas. Si está fuera de zona, rechaza el pedido amablemente.
3. **PAGO Y VUELTO:** Una vez confirmada una ubicación válida, pregúntale: "¿Abonás en efectivo o con transferencia (Mercado Pago)?"
   - Si dice **Efectivo**, es OBLIGATORIO preguntarle con qué billete va a pagar para calcular el vuelto.
   - Si dice **Transferencia**, dile que el pago se realiza al recibir el pedido: el chofer llevará un código QR para que pueda abonar en el momento de la entrega.
4. **TICKET FINAL:** Cuando tengas Productos + Ubicación Válida + Método de Pago completo, genera un resumen así:
   📋 *RESUMEN DE TU PEDIDO*
   - [Producto 1] ($Monto)
   🚚 *Envío a:* [Dirección]
   💵 *Método de pago:* [Efectivo/Transferencia] (Aclarar vuelto si es efectivo)
   💰 *TOTAL:* $[Total]
   
   ¿Está todo correcto para confirmar el pedido? (Responde SÍ o NO)

5. **CONFIRMACIÓN Y EXTRACCIÓN (¡MUY IMPORTANTE!):** Si el cliente responde afirmativamente (ej: "sí", "dale", "ok") al Ticket Final, DEBES generar un ÚNICO mensaje que contenga EXCLUSIVAMENTE la siguiente etiqueta y estructura JSON. No agregues saludos ni texto adicional, SOLO este bloque para que el sistema lo procese:
[PEDIDO_CONFIRMADO]
{
  "productos": [
    {"nombre": "Bolsa de leña 100kg", "cantidad": 1},
    {"nombre": "Garrafa de 15kg YPF", "cantidad": 1}
  ],
  "total": 72000,
  "modalidad": "Delivery",
  "direccion": "San Martin 123",
  "localidad": "La Falda",
  "metodo_pago": "Transferencia"
}

*Reglas de comportamiento y negocio:*
- NUNCA uses lenguaje robótico. Eres un humano hablando por WhatsApp.
- MULTIPLES MENSAJES: Si quieres enviar múltiples mensajes separados (en diferentes burbujas de chat), usa el separador "|||". Por ejemplo: "¡Hola! Buenas tardes. ||| ¿Sería para envío a domicilio o retirás por el local?". Úsalo para que la conversación fluya más natural.
- ATENCIÓN CON LAS BOLSITAS: La compra mínima para cualquier producto que sea "bolsita" (de leña, carbón, etc.) es de 2 unidades. Si piden solo 1, infórmales amablemente de esta condición.
- Si el cliente te da varios datos en un solo mensaje (ej: "Hola, quiero un gas de 10kg a San Martín 123"), procesa lo que ya te dio, ignora las fases anteriores y PREGUNTA ÚNICAMENTE LA FASE QUE FALTA del Flujo Estricto.
- Si el pedido no es claro, pide aclaración rápidamente.
- NUNCA inventes precios. Usa estrictamente los precios de la lista de arriba.
- CUANDO EL CLIENTE PIDA LA LISTA DE PRECIOS: Si pide la lista general, debes mostrar SIEMPRE la lista completa de TODOS los productos en texto (SIN mandar fotos). Si pide los precios de una categoría específica (ej: "precios de leña"), debes mostrar los precios de esa categoría Y ADEMÁS incluir la etiqueta [FOTO_id_de_la_foto] correspondiente para CADA UNO de esos productos de esa categoría, así se le envían todas las imágenes juntas. ESTÁ ESTRICTAMENTE PROHIBIDO resumir la lista usando "...", "etc.", o frases como "y los demás según el catálogo". Debes transcribir cada uno de los productos solicitados uno por uno. IMPORTANTE: Al mostrar la lista al cliente, OMITE y NO IMPRIMAS la parte que dice "(ID_FOTO: ...)", esa información es solo para que sepas qué poner adentro del corchete [FOTO_...].
- Si el cliente da una ubicación que claramente NO es de nuestras zonas de envío, RECHAZA amablemente el pedido indicando que está fuera de nuestra zona de cobertura.
- ¡OJO! Dentro de nuestras zonas de envío existen calles que tienen nombres de provincias o países (ej: calle Santiago del Estero, Buenos Aires, Perú, etc). Si el cliente menciona una calle con nombre de provincia PERO especifica que está en una de nuestras ciudades (ej: "Santiago del Estero 770, La Falda"), es una dirección VÁLIDA. NUNCA le digas que esa dirección queda en otra provincia. Asume que es una calle local.
- SI EL CLIENTE PIDE EXPLÍCITAMENTE UNA FOTO O IMAGEN DE UN PRODUCTO: debes incluir al final de tu respuesta EXACTAMENTE esta etiqueta: [FOTO_id_de_la_foto]. Debes reemplazar "id_de_la_foto" copiando exactamente el "ID_FOTO" que aparece entre paréntesis al lado del precio del producto en el catálogo. Por ejemplo, si el catálogo dice (ID_FOTO: gas/garrafa_15kg_ypf), la etiqueta debe ser [FOTO_gas/garrafa_15kg_ypf]. El sistema interceptará esto y enviará la foto real. NUNCA envíes fotos por defecto si no te las piden.`;
}

async function getAIResponse(userPhone: string, userMessage: string, chatId?: string | null): Promise<string> {
    // Obtenemos siempre el systemPrompt actualizado (para reflejar precios y stock al instante)
    const systemPrompt = await getDynamicSystemPrompt();

    // Si tenemos chatId en Supabase, reconstruimos los últimos 14 mensajes desde la BD
    // Esto garantiza que si el bot se reinició o un humano intervino desde la web, la IA tenga el contexto real.
    let historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (chatId) {
        try {
            const { data: dbMsgs } = await supabase
                .from('whatsapp_mensajes')
                .select('es_bot, mensaje')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(14);

            if (dbMsgs && dbMsgs.length > 0) {
                historyMessages = dbMsgs.reverse().map((m: any) => ({
                    role: (m.es_bot ? 'assistant' : 'user') as 'assistant' | 'user',
                    content: String(m.mensaje || '')
                }));
            }
        } catch (err) {
            console.error('Error cargando historial desde Supabase:', err);
        }
    }

    if (historyMessages.length > 0) {
        // Verificar que el último mensaje sea el actual del usuario; si no, agregarlo
        const lastMsg = historyMessages[historyMessages.length - 1];
        if (lastMsg.role !== 'user' || lastMsg.content !== userMessage) {
            historyMessages.push({ role: 'user', content: userMessage });
        }
        conversationHistories[userPhone] = [
            { role: 'system', content: systemPrompt },
            ...historyMessages
        ];
    } else {
        // Fallback en memoria si no hubo chatId
        if (!conversationHistories[userPhone]) {
            conversationHistories[userPhone] = [
                { role: 'system', content: systemPrompt }
            ];
        } else {
            conversationHistories[userPhone][0] = { role: 'system', content: systemPrompt };
        }
        conversationHistories[userPhone].push({ role: 'user', content: userMessage });

        if (conversationHistories[userPhone].length > 15) {
            conversationHistories[userPhone] = [
                conversationHistories[userPhone][0],
                ...conversationHistories[userPhone].slice(conversationHistories[userPhone].length - 14)
            ];
        }
    }

    const messagesToSend = [...conversationHistories[userPhone]];

    // Si es el primer mensaje de la conversación y el usuario SOLO saluda (sin pedir nada ni consultar precios),
    // guiamos a la IA para dar la bienvenida cálida; si ya pide un producto o precio, la dejamos avanzar directo al Paso 2.
    if (messagesToSend.length === 2) {
        const cleanMsg = userMessage.trim().toLowerCase();
        const isOnlyGreeting = /^(hola+|buenas+|buen d[ií]a|buenas tardes|buenas noches|qué tal|que tal|hola buenas|hola buen d[ií]a)[!.,?\s]*$/i.test(cleanMsg);
        if (isOnlyGreeting) {
            messagesToSend[1] = {
                role: 'user',
                content: `${userMessage}\n\n[INSTRUCCIÓN DEL SISTEMA: El cliente acaba de saludar sin pedir un producto aún. Responde con este saludo de bienvenida:\n"¡Hola! 👋 Soy el asistente de *Los 2 Hermanos*.\n¿Cómo te puedo ayudar hoy? ¿Querés consultar precios, hacer un pedido o tenés alguna otra consulta? ¡Estoy a tu disposición!"]`
            };
        }
    }

    try {
        const completion = await groq.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: messagesToSend,
        });

        const reply = completion?.choices?.[0]?.message?.content || 'Lo siento, tuve un problema al procesar tu solicitud.';
        
        // Añadimos la respuesta del asistente al historial en memoria
        conversationHistories[userPhone].push({ role: 'assistant', content: reply });

        return reply;
    } catch (error: any) {
        console.error('=== ERROR DE IA ===');
        console.error(error?.message || error);
        console.error('===================');
        return 'Ocurrió un error al contactar al agente de IA. Por favor, intenta de nuevo más tarde.';
    }
}

// Contador de intentos para backoff exponencial
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 60000; // Tope máximo de 60 segundos

async function connectToWhatsApp() {
    console.log(`Iniciando conexión con WhatsApp usando directorio: ${AUTH_FOLDER}`);
    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        syncFullHistory: false // Evita descargar chats antiguos para mayor estabilidad
    });
    
    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    // Bandera para pedir el pairing code UNA sola vez por conexión
    let pairingRequested = false;

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // El socket ya está listo (WS abierto). Si hay un número pendiente,
            // pedimos el PAIRING CODE en lugar de mostrar el QR. Pedirlo antes
            // de este punto falla porque el socket aún no puede enviar nodos.
            if (pendingPairingNumber && !state.creds.registered && !pairingRequested) {
                pairingRequested = true;
                console.log('[PAIRING] Solicitando código de emparejamiento para:', pendingPairingNumber);
                sock.requestPairingCode(pendingPairingNumber)
                    .then((code: string) => {
                        currentPairingCode = code ?? '';
                        botStatus = 'paired';
                        console.log('[PAIRING] Código generado:', currentPairingCode);
                    })
                    .catch((err: any) => {
                        console.error('[PAIRING] Error al obtener pairing code:', err?.message || err);
                        currentPairingCode = '';
                        botStatus = 'disconnected';
                    });
            } else {
                console.log('\n--- Escanea este QR con tu WhatsApp ---');
                qrcode.generate(qr, { small: true });
                botStatus = 'qr';
                currentQR = qr;
            }
        }

        if (connection === 'close') {
            botStatus = 'disconnected';
            currentQR = '';
            currentPairingCode = '';
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            console.log('Conexión cerrada. LoggedOut:', isLoggedOut, '| StatusCode:', statusCode);
            
            if (isLoggedOut) {
                console.log('Sesión cerrada definitivamente en el celular (Logged Out). Borrando credenciales locales...');
                try {
                    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                } catch(e) {}
                pendingPairingNumber = null;
                reconnectAttempts = 0;
                // Iniciamos una única vez para generar un nuevo código QR limpio (sin loop de reconexión)
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                // Backoff exponencial con tope de 60 segundos para evitar saturación de red o ban
                reconnectAttempts++;
                const delayMs = Math.min(MAX_RECONNECT_DELAY_MS, Math.round(2000 * Math.pow(1.5, reconnectAttempts)));
                console.log(`Reintentando conexión (intento ${reconnectAttempts}) en ${Math.round(delayMs / 1000)}s...`);
                setTimeout(() => connectToWhatsApp(), delayMs);
            }
        } else if (connection === 'open') {
            botStatus = 'connected';
            currentQR = '';
            currentPairingCode = '';
            pendingPairingNumber = null;
            reconnectAttempts = 0; // Resetear intentos al conectar con éxito
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

        // Comportamiento humano: marcar mensaje recibido como leído
        try {
            await sock.readMessages([msg.key]);
        } catch (readErr) {
            // Silencioso si no soporta lectura
        }
        
        // Extraer texto del mensaje (puede ser conversation o extendedTextMessage)
        let textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // Procesar ubicación nativa de WhatsApp (locationMessage o liveLocationMessage)
        const locMsg = msg.message.locationMessage || msg.message.liveLocationMessage;
        if (!textMessage && locMsg) {
            const lat = locMsg.degreesLatitude;
            const lng = locMsg.degreesLongitude;
            const locName = (locMsg as any).name || '';
            const locAddress = (locMsg as any).address || '';
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            const extraInfo = [locName, locAddress].filter(Boolean).join(' - ');
            textMessage = extraInfo
                ? `[Ubicación enviada por pin de WhatsApp: ${extraInfo} (${mapsUrl})]`
                : `[Ubicación enviada por pin de WhatsApp: (${mapsUrl}) - Sin nombre de calle escrito]`;
            console.log(`Ubicación recibida de ${remoteJid}: ${textMessage}`);
        }

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
                
                const fileName = path.join(os.tmpdir(), `audio_${Date.now()}_${remoteJid.split('@')[0]}.ogg`);
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
                    await supabase.from('whatsapp_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
                    
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
                // Simulación humana: presencia de "Escribiendo..." y delay realista de lectura/pensamiento
                await sock.sendPresenceUpdate('composing', remoteJid);
                const humanReadDelay = Math.floor(Math.random() * 1500) + 1500; // entre 1.5s y 3.0s
                await new Promise(resolve => setTimeout(resolve, humanReadDelay));

                // Obtener respuesta de la IA (sincronizada con el historial de Supabase y catálogo fresco)
                const rawReply = await getAIResponse(remoteJid, textMessage, chatId);
                console.log(`[DEBUG] Respuesta IA (cruda): ${rawReply.substring(0, 500)}`);

                const { replyText, imagesToSend } = await processAIResponseAndConfirmOrder(remoteJid, rawReply);
                console.log(`[DEBUG] Tags extraídos: ${imagesToSend.length} | Texto limpio: ${replyText.substring(0, 300)}`);

                // Enviar todas las imágenes al usuario con pausas naturales
                for (const imgUrl of imagesToSend) {
                    try {
                        console.log(`[DEBUG] Enviando imagen: ${imgUrl}`);
                        await sock.sendPresenceUpdate('composing', remoteJid);
                        await new Promise(resolve => setTimeout(resolve, 1400));
                        await sock.sendMessage(remoteJid, { image: { url: imgUrl } });
                        console.log(`[DEBUG] Imagen enviada OK: ${imgUrl}`);
                        // Pausa de 1s luego de enviar imagen
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (imgErr) {
                        console.error(`[ERROR] Fallo al enviar imagen ${imgUrl}:`, imgErr);
                    }
                }
                
                if (replyText) {
                    const textBubbles = replyText.split('|||').map(m => m.trim()).filter(Boolean);
                    for (let i = 0; i < textBubbles.length; i++) {
                        const textBubble = textBubbles[i];
                        
                        // Simular escritura proporcional al tamaño del mensaje (entre 1.2s y 3.0s)
                        await sock.sendPresenceUpdate('composing', remoteJid);
                        const typingDelay = Math.min(3000, Math.max(1200, textBubble.length * 20));
                        await new Promise(resolve => setTimeout(resolve, typingDelay));

                        await sock.sendMessage(remoteJid, { text: textBubble });

                        // Pausa natural entre burbujas consecutivas
                        if (i < textBubbles.length - 1) {
                            const pauseBetween = Math.floor(Math.random() * 800) + 800; // 800ms a 1600ms
                            await new Promise(resolve => setTimeout(resolve, pauseBetween));
                        }
                    }
                }
                
                // Finalizar estado de "Escribiendo..."
                await sock.sendPresenceUpdate('paused', remoteJid);

                // Guardar la respuesta de la IA en la BD
                if (chatId) {
                    await supabase.from('whatsapp_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
                    
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
