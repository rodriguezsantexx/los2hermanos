"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Localidad = { id: string; nombre: string };

type Chat = {
  id: string;
  nombre_contacto: string;
  telefono: string;
  modo_ia: boolean;
  updated_at: string;
};

type Mensaje = {
  id: string;
  es_bot: boolean;
  mensaje: string;
  created_at: string;
};

export default function ClientesPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatActivo, setChatActivo] = useState<Chat | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [clienteModal, setClienteModal] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nombre: "", telefono: "", direccion: "", localidad_id: "" });
  const [botStatus, setBotStatus] = useState<any>(null);

  useEffect(() => {
    const checkStatus = () => {
      fetch('http://localhost:3005/api/status')
        .then(r => r.json())
        .then(setBotStatus)
        .catch(() => setBotStatus({ status: 'disconnected' }));
    };
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    
    fetchChats();
    
    // Suscripción en tiempo real a la tabla de chats
    const chatsChannel = supabase.channel('chats_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats' }, payload => {
        fetchChats(); // Recargar la lista cuando haya un cambio
      })
      .subscribe();
      
    fetch("http://localhost:8000/api/clientes/localidades")
      .then(res => res.json())
      .then((data: Localidad[]) => { setLocalidades(data); if (data[0]) setClienteForm(prev => ({ ...prev, localidad_id: data[0].id })); })
      .catch(() => undefined);
      
    return () => {
      clearInterval(interval);
      supabase.removeChannel(chatsChannel);
    };
  }, []);

  useEffect(() => {
    if (chatActivo) {
      fetchMensajes(chatActivo.id);
      const channel = supabase.channel('mensajes_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensajes', filter: `chat_id=eq.${chatActivo.id}` }, payload => {
          setMensajes(prev => [...prev, payload.new as Mensaje]);
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [chatActivo]);

  const fetchChats = async () => {
    const { data } = await supabase.from('whatsapp_chats').select('*').order('updated_at', { ascending: false });
    setChats(data || []);
  };

  const fetchMensajes = async (chatId: string) => {
    const { data } = await supabase.from('whatsapp_mensajes').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    setMensajes(data || []);
  };

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mensaje.trim() || !chatActivo) return;
    const text = mensaje;
    setMensaje("");
    await fetch('http://localhost:3005/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: chatActivo.telefono, mensaje: text })
    });
  };

  const crearCliente = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch("http://localhost:8000/api/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clienteForm) });
    if (!res.ok) { const data = await res.json(); alert(data.detail || "No se pudo crear el cliente"); return; }
    setClienteForm({ nombre: "", telefono: "", direccion: "", localidad_id: localidades[0]?.id || "" });
    setClienteModal(false);
    alert("Cliente creado correctamente");
  };

  const reiniciarBot = async () => {
    if (!confirm('¿Seguro que deseas borrar la sesión actual y generar un nuevo QR?')) return;
    await fetch('http://localhost:3005/api/restart', { method: 'POST' });
    setBotStatus({ status: 'disconnected' });
  };

  const cambiarModo = async () => {
    if (!chatActivo) return;
    const nuevoModo = !chatActivo.modo_ia;
    await supabase.from('whatsapp_chats').update({ modo_ia: nuevoModo }).eq('id', chatActivo.id);
    const actualizado = { ...chatActivo, modo_ia: nuevoModo };
    setChatActivo(actualizado);
    setChats(prev => prev.map(chat => chat.id === actualizado.id ? actualizado : chat));
  };

  return (
    <main className="flex min-h-full flex-1 flex-col p-4 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">WhatsApp</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Clientes</h2>
          <p className="mt-1 text-muted">Administrá las conversaciones y elegí quién responde.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={reiniciarBot} className="btn-secondary whitespace-nowrap">🔄 Reiniciar Sesión WhatsApp</button>
          <button onClick={() => setClienteModal(true)} className="btn-primary whitespace-nowrap">+ Nuevo cliente</button>
        </div>
      </header>

      {botStatus && botStatus.status !== 'connected' && (
        <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200 p-6 flex flex-col md:flex-row gap-6 items-center shadow-sm">
          {botStatus.status === 'qr' && botStatus.qr ? (
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(botStatus.qr)}`} alt="QR Code" className="w-[150px] h-[150px] bg-white p-2 rounded-xl border shadow-sm" />
          ) : (
            <div className="w-[150px] h-[150px] bg-white p-2 rounded-xl border shadow-sm flex items-center justify-center">
              <span className="text-4xl animate-spin">⏳</span>
            </div>
          )}
          <div>
            <h3 className="text-xl font-bold text-amber-900 mb-2">WhatsApp Desconectado</h3>
            <p className="text-amber-800 mb-4">
              El bot de WhatsApp perdió la conexión o necesita ser escaneado de nuevo para funcionar.
              Abre WhatsApp en tu teléfono, ve a Dispositivos Vinculados y escanea el código QR de la izquierda.
            </p>
            <button onClick={reiniciarBot} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm">
              Generar un QR Nuevo
            </button>
          </div>
        </div>
      )}

      {clienteModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={crearCliente} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h3 className="text-xl font-bold">Nuevo cliente</h3><button type="button" onClick={() => setClienteModal(false)} className="text-2xl text-gray-400">×</button></div><input required placeholder="Nombre completo" value={clienteForm.nombre} onChange={e => setClienteForm({ ...clienteForm, nombre: e.target.value })} className="w-full rounded-lg border p-3" /><input placeholder="Teléfono" value={clienteForm.telefono} onChange={e => setClienteForm({ ...clienteForm, telefono: e.target.value })} className="w-full rounded-lg border p-3" /><input placeholder="Dirección" value={clienteForm.direccion} onChange={e => setClienteForm({ ...clienteForm, direccion: e.target.value })} className="w-full rounded-lg border p-3" /><select required value={clienteForm.localidad_id} onChange={e => setClienteForm({ ...clienteForm, localidad_id: e.target.value })} className="w-full rounded-lg border p-3">{localidades.map(localidad => <option key={localidad.id} value={localidad.id}>{localidad.nombre}</option>)}</select><div className="flex gap-3"><button type="button" onClick={() => setClienteModal(false)} className="flex-1 rounded-xl bg-gray-100 p-3 font-bold">Cancelar</button><button className="btn-primary flex-1">Guardar cliente</button></div></form></div>}

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
              <button key={chat.id} onClick={() => { setChatActivo(chat); setMostrarLista(false); }} className={`flex w-full items-center gap-3 border-b border-gray-50 p-4 text-left transition-colors ${chatActivo?.id === chat.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{(chat.nombre_contacto || "D").substring(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-gray-900">{chat.nombre_contacto || chat.telefono}</strong><small className="text-gray-400">{new Date(chat.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small></span>
                  <span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-gray-500">{chat.telefono}</span><b className={`rounded-full px-2 py-0.5 text-[10px] text-white ${chat.modo_ia ? 'bg-green-500' : 'bg-amber-500'}`}>{chat.modo_ia ? 'IA' : 'Manual'}</b></span>
                </span>
              </button>
            ))}
            {chats.length === 0 && <p className="p-4 text-center text-sm text-gray-400">No hay chats registrados.</p>}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {chatActivo ? (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 p-4">
                <div className="flex items-center gap-3">
                  <button className="text-xl text-gray-500 md:hidden" onClick={() => setMostrarLista(true)} aria-label="Volver">‹</button>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-white">{(chatActivo.nombre_contacto || "D").substring(0, 1).toUpperCase()}</span>
                  <div><h3 className="font-bold text-gray-900">{chatActivo.nombre_contacto || chatActivo.telefono}</h3><p className="text-xs text-gray-500">{chatActivo.telefono}</p></div>
                </div>
                <button onClick={cambiarModo} className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${chatActivo.modo_ia ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                  {chatActivo.modo_ia ? "🤖 IA Automática" : "👤 Control Manual"}
                </button>
              </div>

              <div className="flex-1 space-y-3 bg-[#f7f9fc] p-4 overflow-y-auto">
                <p className="text-center text-xs text-gray-400">Historial</p>
                {mensajes.map((item) => <div key={item.id} className={`flex ${item.es_bot ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${item.es_bot ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-white text-gray-700"}`}>{item.mensaje}<span className={`ml-3 text-[10px] ${item.es_bot ? "text-blue-100" : "text-gray-400"}`}>{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div></div>)}
              </div>

              <form onSubmit={enviarMensaje} className="flex gap-2 border-t border-gray-100 p-3">
                <input value={mensaje} onChange={e => setMensaje(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-primary" placeholder={chatActivo.modo_ia ? "La IA está activa. Desactívala para escribir..." : "Escribí un mensaje..."} disabled={chatActivo.modo_ia} />
                <button type="submit" disabled={chatActivo.modo_ia || !mensaje.trim()} className="rounded-xl bg-primary px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Enviar</button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-medium">Selecciona una conversación</div>
          )}
        </div>
      </section>
    </main>
  );
}
