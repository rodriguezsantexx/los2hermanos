"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function WhatsappChat() {
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMsg, setInputMsg] = useState("");

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
    await fetch('http://localhost:3005/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: selectedChat.telefono, mensaje: text })
    });
  };

  return (
    <div className="flex h-screen bg-gray-100 text-black">
      {/* Barra Lateral - Lista de Chats */}
      <div className="w-1/3 bg-white border-r flex flex-col">
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
              
              <button 
                onClick={() => toggleIaMode(selectedChat.id, selectedChat.modo_ia)} 
                className={`px-4 py-2 rounded-lg text-white font-medium transition-transform active:scale-95 ${selectedChat.modo_ia ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
              >
                {selectedChat.modo_ia ? 'Desactivar IA (Tomar Control)' : 'Activar Piloto Automático (IA)'}
              </button>
            </div>
            
            {/* Historial de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  placeholder={selectedChat.modo_ia ? "La IA está respondiendo. Apágala para escribir..." : "Escribe un mensaje aquí..."} 
                  className="flex-1 border-none rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" 
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
