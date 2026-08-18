"use client";

import { useState } from "react";

type Chat = {
  id: number;
  nombre: string;
  telefono: string;
  ultimoMensaje: string;
  hora: string;
  noLeidos: number;
  modo: "BOT" | "MANUAL";
};

const chatsIniciales: Chat[] = [
  { id: 1, nombre: "María Gómez", telefono: "+54 9 3548 555 201", ultimoMensaje: "¿Me pueden llevar una garrafa mañana?", hora: "10:42", noLeidos: 2, modo: "BOT" },
  { id: 2, nombre: "Juan Pérez", telefono: "+54 9 3548 555 348", ultimoMensaje: "Gracias, ya recibí el pedido.", hora: "09:18", noLeidos: 0, modo: "MANUAL" },
  { id: 3, nombre: "Ana Rodríguez", telefono: "+54 9 3548 555 774", ultimoMensaje: "¿Qué precio tiene la garrafa de 15kg?", hora: "Ayer", noLeidos: 1, modo: "BOT" },
];

const mensajes = [
  { texto: "Hola, quisiera hacer una consulta.", propio: false, hora: "10:40" },
  { texto: "¡Hola María! Soy el asistente de Los 2 Hermanos. ¿En qué podemos ayudarte?", propio: true, hora: "10:40" },
  { texto: "¿Me pueden llevar una garrafa mañana?", propio: false, hora: "10:42" },
];

export default function ClientesPage() {
  const [chats, setChats] = useState(chatsIniciales);
  const [chatActivo, setChatActivo] = useState(chatsIniciales[0]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const cambiarModo = () => {
    const nuevoModo: Chat["modo"] = chatActivo.modo === "BOT" ? "MANUAL" : "BOT";
    const actualizado = { ...chatActivo, modo: nuevoModo };
    setChatActivo(actualizado);
    setChats(prev => prev.map(chat => chat.id === actualizado.id ? actualizado : chat));
  };

  return (
    <main className="flex min-h-full flex-1 flex-col p-4 md:p-8">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">WhatsApp</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Clientes</h2>
        <p className="mt-1 text-muted">Administrá las conversaciones y elegí quién responde.</p>
      </header>

      <section className="flex min-h-[560px] flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <aside className={`w-full shrink-0 border-r border-gray-100 md:w-80 ${mostrarLista ? "block" : "hidden md:block"}`}>
          <div className="border-b border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Conversaciones</h3>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">WhatsApp</span>
            </div>
            <input className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Buscar cliente..." />
          </div>
          <div>
            {chats.map(chat => (
              <button key={chat.id} onClick={() => { setChatActivo(chat); setMostrarLista(false); }} className={`flex w-full items-center gap-3 border-b border-gray-50 p-4 text-left transition-colors ${chatActivo.id === chat.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{chat.nombre.split(" ").map(n => n[0]).join("")}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-gray-900">{chat.nombre}</strong><small className="text-gray-400">{chat.hora}</small></span>
                  <span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-gray-500">{chat.ultimoMensaje}</span>{chat.noLeidos > 0 && <b className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">{chat.noLeidos}</b>}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <button className="text-xl text-gray-500 md:hidden" onClick={() => setMostrarLista(true)} aria-label="Volver">‹</button>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-white">{chatActivo.nombre.split(" ").map(n => n[0]).join("")}</span>
              <div><h3 className="font-bold text-gray-900">{chatActivo.nombre}</h3><p className="text-xs text-gray-500">{chatActivo.telefono}</p></div>
            </div>
            <button onClick={cambiarModo} className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${chatActivo.modo === "BOT" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
              {chatActivo.modo === "BOT" ? "🤖 BOT activo" : "👤 Modo manual"}
            </button>
          </div>

          <div className="flex-1 space-y-3 bg-[#f7f9fc] p-4">
            <p className="text-center text-xs text-gray-400">Hoy</p>
            {mensajes.map((item, index) => <div key={index} className={`flex ${item.propio ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${item.propio ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-white text-gray-700"}`}>{item.texto}<span className={`ml-3 text-[10px] ${item.propio ? "text-blue-100" : "text-gray-400"}`}>{item.hora}</span></div></div>)}
          </div>

          <form onSubmit={e => { e.preventDefault(); setMensaje(""); }} className="flex gap-2 border-t border-gray-100 p-3">
            <input value={mensaje} onChange={e => setMensaje(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-primary" placeholder={chatActivo.modo === "BOT" ? "El BOT está respondiendo..." : "Escribí un mensaje..."} disabled={chatActivo.modo === "BOT"} />
            <button disabled={chatActivo.modo === "BOT" || !mensaje.trim()} className="rounded-xl bg-primary px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Enviar</button>
          </form>
        </div>
      </section>
    </main>
  );
}
