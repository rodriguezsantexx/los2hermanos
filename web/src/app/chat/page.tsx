"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function WhatsappChat() {
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [generandoPedido, setGenerandoPedido] = useState(false);
  const [notificacion, setNotificacion] = useState("");

  const mostrarNotificacion = (msg: string) => {
    setNotificacion(msg);
    setTimeout(() => setNotificacion(""), 4000);
  };

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
      
      const channel = supabase.channel('mensajes_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensajes', filter: `chat_id=eq.${selectedChat.id}` }, payload => {
          setMessages(prev => [...prev, payload.new]);
        })
        .subscribe();
      
      return () => { supabase.removeChannel(channel) };
    }
  }, [selectedChat]);

  const fetchChats = async () => {
    const { data } = await supabase.from('whatsapp_chats').select('*').order('updated_at', { ascending: false });
    setChats(data || []);
  };

  const fetchMessages = async (chatId: string) => {
    const { data } = await supabase.from('whatsapp_mensajes').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const toggleIaMode = async (chatId: string, currentMode: boolean) => {
    await supabase.from('whatsapp_chats').update({ modo_ia: !currentMode }).eq('id', chatId);
    fetchChats();
    if(selectedChat?.id === chatId) setSelectedChat({ ...selectedChat, modo_ia: !currentMode });
  };

  const sendMessage = async () => {
    if(!inputMsg.trim() || !selectedChat) return;
    const text = inputMsg;
    setInputMsg("");
    
    // Le pegamos al servidor Express del bot (que escucha en el puerto 3005)
    await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: selectedChat.telefono, mensaje: text })
    });
  };

  const generarPedidoConIA = async () => {
    if (!selectedChat) return;
    setGenerandoPedido(true);
    mostrarNotificacion("🤖 Analizando la conversación con IA...");
    
    try {
      // 1. Obtener productos y localidades
      const [prodRes, locRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/localidades`)
      ]);
      const productos = await prodRes.json();
      const localidades = await locRes.json();

      // 2. Extraer pedido
      const extractRes = await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/extract-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: selectedChat.id, productos_disponibles: productos, localidades_disponibles: localidades })
      });
      if (!extractRes.ok) throw new Error("Error extrayendo datos con IA");
      const pedidoExtraido = await extractRes.json();
      
      if (!pedidoExtraido.detalles || pedidoExtraido.detalles.length === 0) {
        throw new Error("No se detectaron productos en la conversación");
      }

      mostrarNotificacion("👤 Verificando cliente...");
      // 3. Buscar o crear cliente
      let clienteId = null;
      let localidadId = pedidoExtraido.localidad_id || localidades[0]?.id; // Default si falla
      
      const clientesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}` }
      });
      const clientes = await clientesRes.json();
      
      // Buscar por teléfono (limpiando espacios)
      const telLimpio = selectedChat.telefono.replace(/[^0-9]/g, '');
      const clienteExistente = clientes.find((c: any) => c.telefono && c.telefono.replace(/[^0-9]/g, '') === telLimpio);
      
      if (clienteExistente) {
        clienteId = clienteExistente.id;
        localidadId = clienteExistente.localidad_id || localidadId;
      } else {
        mostrarNotificacion("👤 Registrando nuevo cliente...");
        const nuevoClienteRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}` },
          body: JSON.stringify({
            nombre: selectedChat.nombre_contacto || "Cliente WhatsApp",
            telefono: selectedChat.telefono,
            direccion: pedidoExtraido.direccion || "Sin dirección",
            localidad_id: localidadId
          })
        });
        if (!nuevoClienteRes.ok) throw new Error("Error creando el cliente");
        const nuevoCliente = await nuevoClienteRes.json();
        clienteId = nuevoCliente.id;
      }

      mostrarNotificacion("📦 Registrando pedido en el sistema...");
      // 4. Crear el pedido
      const payloadPedido = {
        cliente_id: clienteId,
        localidad_id: localidadId,
        metodo_pago: pedidoExtraido.metodo_pago || "Efectivo",
        detalles: pedidoExtraido.detalles.map((d: any) => ({
          producto_id: d.producto_id,
          cantidad: d.cantidad || 1,
          precio_unitario: productos.find((p:any) => p.id === d.producto_id)?.precio || 0
        }))
      };

      const pedidoRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}` },
        body: JSON.stringify(payloadPedido)
      });
      
      if (!pedidoRes.ok) throw new Error("Error registrando el pedido");
      
      mostrarNotificacion("✅ ¡Pedido generado con éxito!");
      
      // Mandar un mensaje automático al cliente
      const mensajeConfirmacion = `*¡Genial!* He registrado tu pedido de ${pedidoExtraido.detalles.length} producto(s). Estaremos en camino a la brevedad. Total a pagar estimado: Efectivo/Transferencia. ¡Gracias por elegir Los 2 Hermanos!`;
      await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono: selectedChat.telefono, mensaje: mensajeConfirmacion })
      });
      
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setNotificacion("");
    } finally {
      setGenerandoPedido(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 text-black">
      {/* Notificaciones Flotantes */}
      {notificacion && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-medium animate-in slide-in-from-top-5">
          {notificacion}
        </div>
      )}

      {/* Barra Lateral - Lista de Chats */}
      <div className="w-1/3 bg-white border-r flex flex-col z-10">
        <h2 className="p-4 font-bold text-xl border-b bg-gray-50 text-gray-800">Chats de WhatsApp</h2>
        <div className="overflow-y-auto flex-1">
          {chats.map(chat => (
            <div key={chat.id} onClick={() => setSelectedChat(chat)} className={`p-4 border-b cursor-pointer transition-colors ${selectedChat?.id === chat.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900">{chat.nombre_contacto || chat.telefono}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${chat.modo_ia ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {chat.modo_ia ? 'IA Activada' : 'Modo Humano'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{chat.telefono}</p>
            </div>
          ))}
          {chats.length === 0 && <p className="p-6 text-center text-gray-400">Aún no hay chats registrados.</p>}
        </div>
      </div>
      
      {/* Ventana de Chat Principal */}
      <div className="flex-1 flex flex-col bg-[#e5ddd5]">
        {selectedChat ? (
          <>
            {/* Header del Chat */}
            <div className="p-4 bg-white border-b flex justify-between items-center shadow-sm z-10">
              <div>
                <h3 className="font-bold text-lg text-gray-800">{selectedChat.nombre_contacto}</h3>
                <p className="text-sm text-gray-500">{selectedChat.telefono}</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={generarPedidoConIA}
                  disabled={generandoPedido || messages.length === 0}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {generandoPedido ? '⏳ Procesando...' : '✨ Generar Pedido'}
                </button>
                <button 
                  onClick={() => toggleIaMode(selectedChat.id, selectedChat.modo_ia)} 
                  className={`px-4 py-2 rounded-lg text-white font-medium transition-transform shadow-md ${selectedChat.modo_ia ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
                >
                  {selectedChat.modo_ia ? '🤖 IA Activada (Click para Pausar)' : '👤 Tú respondes (Click para Auto)'}
                </button>
              </div>
            </div>
            
            {/* Historial de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundRepeat: 'repeat', opacity: 0.9 }}>
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.es_bot ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${msg.es_bot ? 'bg-[#dcf8c6] text-gray-900 rounded-br-none' : 'bg-white text-gray-900 border rounded-bl-none'}`}>
                    {msg.mensaje}
                    <div className="text-[10px] text-gray-500 mt-1 text-right">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Caja de Texto (Solo habilitada si la IA está apagada) */}
            <div className="p-4 bg-[#f0f0f0] border-t">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={inputMsg} 
                  onChange={e => setInputMsg(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && sendMessage()} 
                  placeholder={selectedChat.modo_ia ? "La IA está respondiendo automáticamente. Apágala para tomar el control..." : "Escribe un mensaje aquí..."} 
                  className="flex-1 border-none rounded-full px-5 py-3 outline-none focus:ring-2 focus:ring-primary shadow-sm disabled:bg-gray-200" 
                  disabled={selectedChat.modo_ia} 
                />
                <button 
                  onClick={sendMessage} 
                  disabled={selectedChat.modo_ia || !inputMsg.trim()} 
                  className="bg-[#00a884] text-white px-6 py-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#008f6f]"
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white/50 px-6 py-3 rounded-full text-gray-500 font-medium shadow-sm">
              Selecciona un chat del menú lateral para comenzar
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
