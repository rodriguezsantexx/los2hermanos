'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  id: string;
  text: string;
  isBot: boolean;
  time: string;
  imageUrls?: string[];
};

export default function SimuladorPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: '¡Hola! Escribe un mensaje para probar el bot de IA.',
      isBot: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [TELEFONO_PRUEBA] = useState(() => `54911${Math.floor(Math.random() * 100000000)}@s.whatsapp.net`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue;
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), text: userText, isBot: false, time: timeNow }
    ]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || `${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}"}/api/simulate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefono: TELEFONO_PRUEBA,
          mensaje: userText
        })
      });

      const data = await res.json();
      const replyText = data.reply || data.error || 'Error desconocido';
      const imageUrls = data.images || undefined;

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: replyText,
          isBot: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          imageUrls: imageUrls
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: '❌ Error: No se pudo conectar con el bot. ¿Está corriendo en el puerto 3005?',
          isBot: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:p-6 p-0 md:items-center w-full">
      <div className="flex flex-col w-full h-full md:max-w-md bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-center shadow-xl md:rounded-2xl overflow-hidden border border-slate-200 relative">
        
        {/* Header tipo WhatsApp */}
        <div className="bg-[#075E54] text-white p-4 shadow-md flex items-center z-10">
          <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center mr-3 overflow-hidden text-2xl">
            🤖
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">Bot 2 Hermanos</h2>
            <p className="text-xs text-green-100">Simulador de Pruebas</p>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-3 z-10 bg-white/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] rounded-lg p-2.5 shadow-sm relative ${
                msg.isBot
                  ? 'bg-white text-slate-800 self-start rounded-tl-none'
                  : 'bg-[#DCF8C6] text-slate-800 self-end rounded-tr-none'
              }`}
            >
              {msg.imageUrls && msg.imageUrls.map((url, idx) => (
                <img 
                  key={idx}
                  src={url} 
                  alt="Imagen adjunta" 
                  className="w-full rounded-md mb-2 max-h-48 object-cover border border-slate-200"
                />
              ))}
              {msg.text && <span className="text-sm whitespace-pre-wrap">{msg.text}</span>}
              <span className="text-[10px] text-slate-500 self-end mt-1 font-medium select-none">
                {msg.time}
              </span>
            </div>
          ))}
          {isLoading && (
            <div className="bg-white text-slate-500 self-start rounded-lg rounded-tl-none p-3 shadow-sm max-w-[85%] text-sm flex items-center space-x-2">
              <span className="animate-pulse">Escribiendo...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-[#F0F0F0] p-3 z-10 w-full">
          <form onSubmit={handleSend} className="flex items-center space-x-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 bg-white rounded-full py-2.5 px-4 outline-none text-sm text-slate-800 focus:ring-1 focus:ring-green-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="w-10 h-10 bg-[#00897B] text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-[#00796B] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-1">
                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
