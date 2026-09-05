"use client";

import { useEffect, useState, useRef } from "react";

import { supabase } from "@/lib/supabase";
import ReactMarkdown from 'react-markdown';
import { useNotifications } from '@/context/NotificationContext';
import { getToken } from '@/lib/session';

type Localidad = { id: string; nombre: string };
type Producto = { id: string; nombre: string; precio: number };

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
  const [mensaje, setMensaje] = useState("");
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [clienteModal, setClienteModal] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nombre: "", telefono: "", direccion: "", localidad_id: "" });
  const [botStatus, setBotStatus] = useState<any>(null);
  const mensajesEndRef = useRef<HTMLDivElement>(null);
  const prevMensajesLength = useRef(0);
  const { unreadChats, markAsRead } = useNotifications();

  // Estados para el panel de pedidos
  const [panelPedidoOpen, setPanelPedidoOpen] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [checkDatos, setCheckDatos] = useState(false);
  const [checkUbicacion, setCheckUbicacion] = useState(false);
  const [checkPago, setCheckPago] = useState(false);
  const [loadingIA, setLoadingIA] = useState(false);
  const [pedidoForm, setPedidoForm] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    localidad_id: "",
    observaciones: "",
    metodo_pago: "Efectivo",
    detalles: [] as { producto_id: string; cantidad: number; nombre: string; precio: number }[]
  });

  const todosChecksOK = checkDatos && checkUbicacion && checkPago;

  useEffect(() => {
    if (mensajes.length > prevMensajesLength.current) {
      mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMensajesLength.current = mensajes.length;
  }, [mensajes]);

  useEffect(() => {
    const checkStatus = () => {
      fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/status`)
        .then(r => r.json())
        .then(setBotStatus)
        .catch(() => setBotStatus({ status: 'disconnected' }));
    };
    checkStatus();
    
    fetchChats();
    
    // Polling cada 3 segundos como respaldo si Realtime no está activado
    const interval = setInterval(() => {
      checkStatus();
      fetchChats();
    }, 3000);
    
    // Suscripción en tiempo real a la tabla de chats
    const chatsChannel = supabase.channel('chats_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats' }, payload => {
        fetchChats(); // Recargar la lista cuando haya un cambio
      })
      .subscribe();
      
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/localidades`)
      .then(res => res.json())
      .then((data: Localidad[]) => { setLocalidades(data); if (data[0]) setClienteForm(prev => ({ ...prev, localidad_id: data[0].id })); })
      .catch(() => undefined);
      
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos`)
      .then(res => res.json())
      .then(setProductos)
      .catch(() => undefined);
      
    return () => {
      clearInterval(interval);
      supabase.removeChannel(chatsChannel);
    };
  }, []);

  useEffect(() => {
    if (chatActivo) {
      setPanelPedidoOpen(false); // reset panel when switching chats
      setPedidoForm(prev => ({ ...prev, telefono: chatActivo.telefono, nombre: chatActivo.nombre_contacto || "" }));
      setCheckDatos(false); setCheckUbicacion(false); setCheckPago(false);
      markAsRead(chatActivo.id);
      fetchMensajes(chatActivo.id);
      
      // Polling de mensajes cada 3 segundos como respaldo
      const msjInterval = setInterval(() => {
        fetchMensajes(chatActivo.id);
        markAsRead(chatActivo.id);
      }, 3000);
      
      const channel = supabase.channel('mensajes_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensajes', filter: `chat_id=eq.${chatActivo.id}` }, payload => {
          markAsRead(chatActivo.id);
          // Si el realtime funciona, actualizamos el state directamente (también se actualizará por el polling)
          setMensajes(prev => {
            const existe = prev.find(m => m.id === (payload.new as Mensaje).id);
            if (existe) return prev;
            return [...prev, payload.new as Mensaje];
          });
        })
        .subscribe();
        
      return () => { 
        clearInterval(msjInterval);
        supabase.removeChannel(channel); 
      };
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
    await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: chatActivo.telefono, mensaje: text })
    });
  };

  const crearCliente = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` }, body: JSON.stringify(clienteForm) });
    if (!res.ok) { const data = await res.json(); alert(data.detail || "No se pudo crear el cliente"); return; }
    setClienteForm({ nombre: "", telefono: "", direccion: "", localidad_id: localidades[0]?.id || "" });
    setClienteModal(false);
    alert("Cliente creado correctamente");
  };

  const aprobarPedido = async () => {
    if (pedidoForm.detalles.length === 0) return alert("Agrega al menos un producto");
    if (!pedidoForm.localidad_id) return alert("Selecciona una localidad");
    
    try {
      // 1. Asegurar que el cliente existe
      let cliente_id = "";
      const clienteData = { nombre: pedidoForm.nombre, telefono: pedidoForm.telefono, direccion: pedidoForm.direccion, localidad_id: pedidoForm.localidad_id };
      const clienteRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` }, body: JSON.stringify(clienteData) });
      if (clienteRes.ok) {
        const c = await clienteRes.json();
        cliente_id = c.id;
      } else {
        const c_err = await clienteRes.json();
        if (c_err.detail && typeof c_err.detail === 'string' && c_err.detail.includes("ya existe")) {
          // buscarlo
          const { data } = await supabase.from('clientes').select('id').eq('telefono', pedidoForm.telefono).single();
          if (data) cliente_id = data.id;
        } else {
          throw new Error("No se pudo crear/validar el cliente");
        }
      }

      // 2. Crear Pedido
      const token = getToken();
      const pedidoPayload = {
        cliente_id,
        localidad_id: pedidoForm.localidad_id,
        detalles: pedidoForm.detalles.map(d => ({ producto_id: d.producto_id, cantidad: d.cantidad, precio_unitario: d.precio })),
        metodo_pago: pedidoForm.metodo_pago,
        observaciones: pedidoForm.observaciones
      };

      const pedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(pedidoPayload)
      });
      if (!pedRes.ok) { const data = await pedRes.json(); throw new Error(data.detail || "Error al crear pedido"); }
      
      alert("Pedido aprobado y derivado a los choferes correctamente!");
      setPanelPedidoOpen(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const rellenarConIA = async () => {
    if (!chatActivo) return;
    setLoadingIA(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/extract-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatActivo.id,
          productos_disponibles: productos,
          localidades_disponibles: localidades
        })
      });
      if (!res.ok) throw new Error("Error en la IA");
      const data = await res.json();
      
      const detallesTransformados = (data.detalles || []).map((d: any) => {
        const prod = productos.find(p => p.id === d.producto_id);
        if (!prod) return null;
        return {
          producto_id: prod.id,
          nombre: prod.nombre,
          precio: prod.precio,
          cantidad: d.cantidad || 1
        };
      }).filter(Boolean);

      setPedidoForm(prev => ({
        ...prev,
        direccion: data.direccion || prev.direccion,
        localidad_id: data.localidad_id || prev.localidad_id,
        metodo_pago: data.metodo_pago || prev.metodo_pago,
        detalles: detallesTransformados.length > 0 ? detallesTransformados : prev.detalles
      }));

      if (data.direccion) setCheckUbicacion(true);
      if (data.metodo_pago) setCheckPago(true);
      setCheckDatos(true);
      
    } catch (e) {
      alert("No se pudo extraer la información automáticamente. Por favor, revisa el chat.");
    } finally {
      setLoadingIA(false);
    }
  };

  const reiniciarBot = async () => {
    if (!confirm('¿Seguro que deseas borrar la sesión actual y generar un nuevo QR?')) return;
    await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}/api/restart`, { method: 'POST' });
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
        <aside className={`w-full shrink-0 border-r border-gray-100 md:w-80 ${!chatActivo ? "block" : "hidden md:block"}`}>
          <div className="border-b border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Conversaciones</h3>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">WhatsApp</span>
            </div>
            <input className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Buscar cliente..." />
          </div>
          <div>
            {chats.map(chat => (
              <button key={chat.id} onClick={() => setChatActivo(chat)} className={`flex w-full items-center gap-3 border-b border-gray-50 p-4 text-left transition-colors ${chatActivo?.id === chat.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white relative">
                  {(chat.nombre_contacto || "D").substring(0, 1).toUpperCase()}
                  {unreadChats.includes(chat.id) && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-gray-900">{chat.nombre_contacto || chat.telefono}</strong><small className="text-gray-400">{new Date(chat.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small></span>
                  <span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-gray-500">{chat.telefono}</span><b className={`rounded-full px-2 py-0.5 text-[10px] text-white ${chat.modo_ia ? 'bg-green-500' : 'bg-amber-500'}`}>{chat.modo_ia ? 'IA' : 'Manual'}</b></span>
                </span>
              </button>
            ))}
            {chats.length === 0 && <p className="p-4 text-center text-sm text-gray-400">No hay chats registrados.</p>}
          </div>
        </aside>

        <div className={`min-w-0 flex-1 flex-col ${!chatActivo ? "hidden md:flex" : "flex"} ${panelPedidoOpen ? "hidden lg:flex" : ""}`}>
          {chatActivo ? (
            <>
              <div onClick={() => setPanelPedidoOpen(!panelPedidoOpen)} className="flex cursor-pointer hover:bg-gray-50 items-center justify-between border-b border-gray-100 p-4 transition-colors">
                <div className="flex items-center gap-3">
                  <button className="text-xl text-gray-500 md:hidden" onClick={(e) => { e.stopPropagation(); setChatActivo(null); }} aria-label="Volver">‹</button>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-white">{(chatActivo.nombre_contacto || "D").substring(0, 1).toUpperCase()}</span>
                  <div><h3 className="font-bold text-gray-900">{chatActivo.nombre_contacto || chatActivo.telefono}</h3><p className="text-xs text-gray-500">{chatActivo.telefono}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); cambiarModo(); }} className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${chatActivo.modo_ia ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                    {chatActivo.modo_ia ? "🤖 IA Automática" : "👤 Control Manual"}
                  </button>
                  <span className="text-gray-400 text-xl font-bold ml-2">⋮</span>
                </div>
              </div>

              <div className="flex-1 space-y-3 bg-[#f7f9fc] p-4 overflow-y-auto">
                <p className="text-center text-xs text-gray-400">Historial</p>
                {mensajes.map((item) => <div key={item.id} className={`flex ${item.es_bot ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${item.es_bot ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-white text-gray-700"}`}><ReactMarkdown components={{ strong: ({node, ...props}) => <strong className="font-bold" {...props} /> }}>{item.mensaje}</ReactMarkdown><span className={`ml-3 text-[10px] inline-block ${item.es_bot ? "text-blue-100" : "text-gray-400"}`}>{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div></div>)}
                <div ref={mensajesEndRef} />
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

        {/* PANEL DE PEDIDOS (DERECHA) */}
        {panelPedidoOpen && chatActivo && (
          <aside className="w-full lg:w-96 border-l border-gray-100 bg-white flex flex-col z-20">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900">Seguimiento de Pedido</h3>
              <button onClick={() => setPanelPedidoOpen(false)} className="text-2xl text-gray-400 hover:text-gray-900">×</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* CHECKLIST */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${checkDatos ? 'bg-primary border-primary text-white' : 'border-gray-300 text-transparent'}`}>✓</div>
                  <span className={`font-medium ${checkDatos ? 'text-gray-900 line-through opacity-70' : 'text-gray-700'}`}>Datos Completados</span>
                  <input type="checkbox" className="hidden" checked={checkDatos} onChange={e => setCheckDatos(e.target.checked)} />
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${checkUbicacion ? 'bg-primary border-primary text-white' : 'border-gray-300 text-transparent'}`}>✓</div>
                  <span className={`font-medium ${checkUbicacion ? 'text-gray-900 line-through opacity-70' : 'text-gray-700'}`}>Ubicación Verificada</span>
                  <input type="checkbox" className="hidden" checked={checkUbicacion} onChange={e => setCheckUbicacion(e.target.checked)} />
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${checkPago ? 'bg-primary border-primary text-white' : 'border-gray-300 text-transparent'}`}>✓</div>
                  <span className={`font-medium ${checkPago ? 'text-gray-900 line-through opacity-70' : 'text-gray-700'}`}>Pago Acordado</span>
                  <input type="checkbox" className="hidden" checked={checkPago} onChange={e => setCheckPago(e.target.checked)} />
                </label>
              </div>

              <div className="h-px bg-gray-100"></div>

              {/* FORMULARIO */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Detalles del Pedido</h4>
                  <button onClick={rellenarConIA} disabled={loadingIA} className="flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-all">
                    {loadingIA ? "⏳ Pensando..." : "✨ Rellenar con IA"}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Completo</label>
                  <input value={pedidoForm.nombre} onChange={e => setPedidoForm({...pedidoForm, nombre: e.target.value})} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Dirección Exacta</label>
                  <input value={pedidoForm.direccion} onChange={e => setPedidoForm({...pedidoForm, direccion: e.target.value})} placeholder="Calle, Número, Color de casa" className="w-full border rounded-lg p-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Localidad</label>
                  <select value={pedidoForm.localidad_id} onChange={e => setPedidoForm({...pedidoForm, localidad_id: e.target.value})} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-primary">
                    <option value="">Seleccionar ciudad...</option>
                    {localidades.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Productos</label>
                  <select onChange={e => {
                    const p = productos.find(x => x.id === e.target.value);
                    if(p) setPedidoForm({...pedidoForm, detalles: [...pedidoForm.detalles, { producto_id: p.id, nombre: p.nombre, cantidad: 1, precio: p.precio }]});
                    e.target.value = "";
                  }} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-primary">
                    <option value="">+ Añadir producto...</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} - ${p.precio}</option>)}
                  </select>
                  
                  {pedidoForm.detalles.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {pedidoForm.detalles.map((det, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg text-sm">
                          <input type="number" min="1" value={det.cantidad} onChange={e => {
                            const newDet = [...pedidoForm.detalles]; newDet[idx].cantidad = Number(e.target.value); setPedidoForm({...pedidoForm, detalles: newDet});
                          }} className="w-12 border rounded p-1 text-center" />
                          <span className="flex-1 font-medium">{det.nombre}</span>
                          <button onClick={() => setPedidoForm({...pedidoForm, detalles: pedidoForm.detalles.filter((_, i) => i !== idx)})} className="text-red-500 font-bold hover:text-red-700">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Método de Pago</label>
                  <select value={pedidoForm.metodo_pago} onChange={e => setPedidoForm({...pedidoForm, metodo_pago: e.target.value})} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-primary">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100">
              <button 
                onClick={aprobarPedido}
                disabled={!todosChecksOK}
                className={`w-full py-3 rounded-xl font-bold transition-all ${todosChecksOK ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 hover:bg-green-600 hover:-translate-y-0.5' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                Aprobar Pedido
              </button>
              {!todosChecksOK && <p className="text-[10px] text-center text-gray-400 mt-2">Marca todos los checks arriba para habilitar</p>}
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}
