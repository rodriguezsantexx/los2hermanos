"use client";

import { Fragment, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Producto = { id: string; nombre: string; precio: number; stock_actual: number };
type Detalle = { producto: string; cantidad: number; precio: number };
type Cliente = { id: string; nombre: string; localidad_id: string; localidades?: { nombre?: string } | null };
type Localidad = { id: string; nombre: string };

const pedidosIniciales: any[] = [];

function PedidosContent() {
  const searchParams = useSearchParams();
  const [filtro, setFiltro] = useState("Todos");
  const [pedidos, setPedidos] = useState(pedidosIniciales);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cliente, setCliente] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [producto, setProducto] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [detalles, setDetalles] = useState<Detalle[]>([]);
  const [pedidoAbierto, setPedidoAbierto] = useState<string | null>(null);
  const [pago, setPago] = useState("A confirmar");
  const [tipoPedido, setTipoPedido] = useState("Envío");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const estados = ["Todos", "Pendiente", "Asignado", "En reparto", "Entregado"];
  const pedidosFiltrados = filtro === "Todos" ? pedidos : pedidos.filter(p => p.estado === filtro);
  const productoSeleccionado = productos.find(item => item.id === producto);
  const total = detalles.reduce((sum, item) => sum + item.precio * item.cantidad, 0) + (productoSeleccionado?.precio || 0) * cantidad;

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("los2hermanos_user") || "null");
      setPuedeCrear(user?.roles?.nombre === "ADMIN");
    } catch {
      setPuedeCrear(false);
    }
    
    const fetchPedidos = () => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}`
        }
      })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if(Array.isArray(data)) {
          const pedidosFormateados = data.map(p => ({
            uuid: p.id,
            id: `#${p.id.substring(0, 4).toUpperCase()}`,
            cliente: p.clientes?.nombre || "Desconocido",
            direccion: p.clientes?.direccion || "Sin dirección",
            localidad: p.localidades?.nombre || "Sin localidad",
            tipo: p.tipo_pedido || "Envío",
            total: `$${p.total}`,
            estado: p.estado,
            pago: p.metodo_pago || "A confirmar",
            pago_verificado: p.pago_verificado,
            mp_preference_id: p.mp_preference_id,
            detalles: (p.detalle_pedidos || []).map((d: any) => ({
              producto: d.productos?.nombre || "Producto",
              cantidad: d.cantidad,
              precio: d.precio_unitario
            }))
          }));
          setPedidos(pedidosFormateados);
          
          // Leer query params después de cargar
          const targetId = searchParams.get("id");
          if (targetId) {
            setPedidoAbierto(targetId);
          }
          const action = searchParams.get("action");
          if (action === "new") {
            setModalAbierto(true);
          }
        }
      })
      .catch(() => undefined);
    };

    fetchPedidos();
    
    // Guardamos la función en el objeto window (o en un custom hook) temporalmente para poder llamarla luego
    (window as any).refreshPedidos = fetchPedidos;
    
  }, [searchParams]);

  useEffect(() => {
    if (!puedeCrear) {
      setCargandoProductos(false);
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error("No se pudieron cargar los productos")))
      .then((data: Producto[]) => {
        setProductos(data);
        if (data.length > 0) setProducto(data[0].id);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Error al cargar productos"))
      .finally(() => setCargandoProductos(false));
  }, [puedeCrear]);

  useEffect(() => {
    if (!puedeCrear) return;
    Promise.all([fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes`), fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/localidades`)])
      .then(async ([clientesRes, localidadesRes]) => {
        if (!clientesRes.ok || !localidadesRes.ok) throw new Error("No se pudieron cargar clientes y localidades");
        const clientesData = await clientesRes.json() as Cliente[];
        const localidadesData = await localidadesRes.json() as Localidad[];
        setClientes(clientesData);
        setLocalidades(localidadesData);
        if (clientesData.length > 0) setCliente(clientesData[0].id);
        if (localidadesData.length > 0) setLocalidad(localidadesData[0].id);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Error al cargar datos del pedido"));
  }, [puedeCrear]);

  const crearPedido = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeCrear) return;
    const detallesFinales = [...detalles, ...(productoSeleccionado ? [{ producto_id: productoSeleccionado.id, cantidad, precio_unitario: productoSeleccionado.precio }] : [])];
    if (!detallesFinales.length) {
      alert("Debes agregar al menos un producto al pedido");
      return;
    }
    
    const payload = {
      cliente_id: cliente,
      localidad_id: localidad,
      metodo_pago: pago === "A confirmar" ? null : pago,
      tipo_pedido: tipoPedido,
      detalles: detallesFinales.map((d: any) => ({
        producto_id: d.producto_id || productos.find(p => p.nombre === d.producto)?.id,
        cantidad: d.cantidad,
        precio_unitario: d.precio || d.precio_unitario
      }))
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Error al crear el pedido");
      }
      
      setModalAbierto(false);
      setCantidad(1);
      setTipoPedido("Envío");
      setDetalles([]);
      
      const responseData = await res.json();
      if (responseData.mp_link) {
        // Mostrar link para copiar o abrir
        if (window.confirm("Pedido creado exitosamente. ¿Deseas abrir el link de pago de MercadoPago ahora?")) {
           window.open(responseData.mp_link, "_blank");
        }
      } else {
        alert("Pedido creado correctamente");
      }
      
      if (typeof (window as any).refreshPedidos === "function") {
        (window as any).refreshPedidos();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error desconocido al crear pedido");
    }
  };

  const agregarProducto = () => {
    if (!productoSeleccionado) return;
    setDetalles(prev => [...prev, { producto: productoSeleccionado.nombre, cantidad, precio: productoSeleccionado.precio }]);
    setCantidad(1);
  };

  return (
    <main className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm font-bold uppercase tracking-wider text-primary">Operaciones</p><h2 className="text-3xl font-bold tracking-tight text-gray-900 mt-1">Pedidos</h2><p className="text-muted mt-1">Consultá y gestioná los pedidos de tus clientes.</p></div>
        {puedeCrear && <button onClick={() => setModalAbierto(true)} className="btn-primary w-full md:w-auto"><span className="text-xl">+</span> Nuevo pedido</button>}
      </header>

      {puedeCrear && modalAbierto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"><form onSubmit={crearPedido} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between"><h3 className="text-xl font-bold text-gray-900">Crear nuevo pedido</h3><button type="button" onClick={() => setModalAbierto(false)} className="text-2xl text-gray-400">×</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Cliente<select value={cliente} onChange={e => setCliente(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Localidad<select value={localidad} onChange={e => setLocalidad(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">{localidades.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Producto<select required disabled={cargandoProductos || productos.length === 0} value={producto} onChange={e => setProducto(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">{productos.map(item => <option key={item.id} value={item.id}>{item.nombre} — ${item.precio.toLocaleString("es-AR")} ({item.stock_actual} disponibles)</option>)}</select></label><label className="text-sm font-medium text-gray-700">Cantidad<input type="number" min="1" max={productoSeleccionado?.stock_actual || undefined} required value={cantidad} onChange={e => setCantidad(Math.max(1, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3" /></label></div><button type="button" onClick={agregarProducto} className="w-full rounded-xl border border-primary py-3 font-bold text-primary hover:bg-primary/5 transition-colors">+ Agregar producto extra</button>{detalles.length > 0 && <div className="space-y-2 rounded-xl bg-gray-50 p-3">{detalles.map((item, index) => <div key={index} className="flex justify-between items-center text-sm"><span className="font-bold">{item.cantidad} × {item.producto}</span><button type="button" onClick={() => setDetalles(prev => prev.filter((_, i) => i !== index))} className="text-red-500 font-medium px-2 py-1 hover:bg-red-50 rounded-md">Quitar</button></div>)}</div>}
<div className="grid gap-4 sm:grid-cols-2">
<label className="block text-sm font-medium text-gray-700">Tipo de pedido<select value={tipoPedido} onChange={e => setTipoPedido(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3"><option>Envío</option><option>Local</option></select></label>
<label className="block text-sm font-medium text-gray-700">Método de pago<select value={pago} onChange={e => setPago(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3"><option>A confirmar</option><option>Efectivo</option><option>Transferencia</option><option>Fiado</option></select></label>
</div>
<div className="flex items-center justify-between rounded-xl bg-blue-50 p-4"><span className="font-medium text-gray-600">Total estimado</span><strong className="text-2xl text-primary">${total.toLocaleString("es-AR")}</strong></div><div className="flex gap-3 pt-2"><button type="button" onClick={() => setModalAbierto(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600">Cancelar</button><button type="submit" disabled={cargandoProductos || productos.length === 0} className="btn-primary flex-1 disabled:opacity-50 shadow-primary/30">Crear pedido</button></div></form></div>}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {["Pendiente", "Asignado", "En reparto", "Entregado"].map((estado, index) => <div key={estado} className={`card border-l-4 ${["border-warning", "border-primary", "border-accent", "border-success"][index]}`}><p className="text-xs font-bold uppercase tracking-wider text-muted">{estado === "En reparto" ? estado : `${estado}s`}</p><p className="mt-2 text-3xl font-black text-gray-900">{pedidos.filter(p => p.estado === estado).length}</p></div>)}
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex gap-2 overflow-x-auto border-b border-gray-100 p-4">{estados.map(estado => <button key={estado} onClick={() => setFiltro(estado)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${filtro === estado ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{estado}</button>)}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b border-gray-100 bg-gray-50 text-xs tracking-wider text-gray-500"><th className="p-4">PEDIDO</th><th className="p-4">CLIENTE</th><th className="p-4">DIRECCIÓN</th><th className="p-4">LOCALIDAD</th>{puedeCrear && <th className="p-4">TIPO</th>}<th className="p-4">TOTAL</th><th className="p-4">ESTADO</th><th className="p-4">PAGO</th></tr></thead><tbody className="divide-y divide-gray-100">{pedidosFiltrados.map(pedido => <Fragment key={pedido.uuid}><tr onClick={() => setPedidoAbierto(pedidoAbierto === pedido.uuid ? null : pedido.uuid)} className={`cursor-pointer transition-colors ${pedidoAbierto === pedido.uuid ? "bg-blue-50/50" : "hover:bg-gray-50"}`}><td className="p-4 font-bold text-primary">{pedidoAbierto === pedido.uuid ? "⌄" : "›"} {pedido.id}</td><td className="p-4 font-bold text-gray-900">{pedido.cliente}</td><td className="p-4 text-gray-600">{pedido.tipo === "Local" ? "-" : pedido.direccion}</td><td className="p-4 text-gray-600">{pedido.tipo === "Local" ? "-" : pedido.localidad}</td>{puedeCrear && <td className="p-4 text-gray-600 font-medium">{pedido.tipo}</td>}<td className="p-4 font-bold text-gray-900">{pedido.total}</td><td className="p-4"><span className={pedido.estado === "Entregado" ? "badge-success" : pedido.estado === "Pendiente" ? "badge-warning" : "badge-success"}>{pedido.estado}</span></td><td className="p-4 text-gray-600 flex items-center gap-1">{pedido.pago} {(pedido.pago === "Transferencia" || pedido.pago === "MercadoPago") && (pedido.pago_verificado ? <span className="text-green-500 text-xs font-bold bg-green-100 px-1.5 py-0.5 rounded ml-1" title="Pago Verificado">✔ Verificado</span> : <span className="text-yellow-500 text-xs font-bold bg-yellow-100 px-1.5 py-0.5 rounded ml-1" title="Pendiente de pago">⏳ Pend.</span>)}</td></tr>{pedidoAbierto === pedido.uuid && <tr><td colSpan={puedeCrear ? 8 : 7} className="bg-blue-50/50 px-8 py-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Detalle del pedido</p><div className="space-y-2">{pedido.detalles.map((detalle: any, index: number) => <div key={index} className="flex justify-between text-sm"><span>{detalle.cantidad} × {detalle.producto}</span><span className="font-bold">${(detalle.precio * detalle.cantidad).toLocaleString("es-AR")}</span></div>)}</div>
          {pedido.estado !== "Entregado" && puedeCrear && (
            <button onClick={(e) => { e.stopPropagation(); fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos/${pedido.uuid}/entregar`, { method: `POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}` }, body: JSON.stringify({ estado: "Entregado", metodo_pago: pedido.pago }) }).then(() => { if (typeof (window as any).refreshPedidos === "function") (window as any).refreshPedidos(); }); }} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow hover:bg-primary/90 transition-colors">✔ Marcar como Entregado</button>
          )}
        </td></tr>}</Fragment>)}</tbody></table></div>
        {pedidosFiltrados.length === 0 && <p className="p-8 text-center text-muted">No hay pedidos en este estado.</p>}
      </section>
    </main>
  );
}

export default function PedidosPage() {
  return (
    <Suspense fallback={<div className="p-8">Cargando...</div>}>
      <PedidosContent />
    </Suspense>
  );
}
