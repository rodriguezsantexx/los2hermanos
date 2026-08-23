"use client";

import { Fragment, useEffect, useState } from "react";

type Producto = { id: string; nombre: string; precio: number; stock_actual: number };
type Detalle = { producto: string; cantidad: number; precio: number };
type Cliente = { id: string; nombre: string; localidad_id: string; localidades?: { nombre?: string } | null };
type Localidad = { id: string; nombre: string };

const pedidosIniciales: any[] = [];

export default function PedidosPage() {
  const [filtro, setFiltro] = useState("Todos");
  const [pedidos, setPedidos] = useState(pedidosIniciales);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cliente, setCliente] = useState("María Gómez");
  const [localidad, setLocalidad] = useState("Huerta Grande");
  const [producto, setProducto] = useState("Garrafa 15kg");
  const [cantidad, setCantidad] = useState(1);
  const [detalles, setDetalles] = useState<Detalle[]>([]);
  const [pedidoAbierto, setPedidoAbierto] = useState<string | null>(null);
  const [pago, setPago] = useState("A confirmar");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const estados = ["Todos", "Pendiente", "Asignado", "En reparto", "Entregado"];
  const pedidosFiltrados = filtro === "Todos" ? pedidos : pedidos.filter(p => p.estado === filtro);
  const productoSeleccionado = productos.find(item => item.nombre === producto);
  const total = detalles.reduce((sum, item) => sum + item.precio * item.cantidad, 0) + (productoSeleccionado?.precio || 0) * cantidad;

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("los2hermanos_user") || "null");
      setPuedeCrear(user?.roles?.nombre === "ADMIN");
    } catch {
      setPuedeCrear(false);
    }
    
    // Cargar pedidos reales
    fetch("http://localhost:8000/api/pedidos", {
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("los2hermanos_access_token")}`
      }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if(Array.isArray(data)) {
          const pedidosFormateados = data.map(p => ({
            id: `#${p.id.substring(0, 4).toUpperCase()}`,
            cliente: p.clientes?.nombre || "Desconocido",
            localidad: p.localidades?.nombre || "Sin localidad",
            total: `$${p.total}`,
            estado: p.estado,
            pago: p.metodo_pago || "A confirmar",
            detalles: (p.detalle_pedidos || []).map((d: any) => ({
              producto: d.productos?.nombre || "Producto",
              cantidad: d.cantidad,
              precio: d.precio_unitario
            }))
          }));
          setPedidos(pedidosFormateados);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!puedeCrear) {
      setCargandoProductos(false);
      return;
    }
    fetch("http://localhost:8000/api/productos")
      .then(res => res.ok ? res.json() : Promise.reject(new Error("No se pudieron cargar los productos")))
      .then((data: Producto[]) => {
        setProductos(data);
        if (data.length > 0) setProducto(data[0].nombre);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Error al cargar productos"))
      .finally(() => setCargandoProductos(false));
  }, [puedeCrear]);

  useEffect(() => {
    if (!puedeCrear) return;
    Promise.all([fetch("http://localhost:8000/api/clientes"), fetch("http://localhost:8000/api/clientes/localidades")])
      .then(async ([clientesRes, localidadesRes]) => {
        if (!clientesRes.ok || !localidadesRes.ok) throw new Error("No se pudieron cargar clientes y localidades");
        const clientesData = await clientesRes.json() as Cliente[];
        const localidadesData = await localidadesRes.json() as Localidad[];
        setClientes(clientesData);
        setLocalidades(localidadesData);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Error al cargar datos del pedido"));
  }, [puedeCrear]);

  const crearPedido = (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeCrear) return;
    const detallesFinales = [...detalles, ...(productoSeleccionado ? [{ producto: productoSeleccionado.nombre, cantidad, precio: productoSeleccionado.precio }] : [])];
    if (!detallesFinales.length) return;
    const nuevo = {
      id: `#${1060 + pedidos.length}`,
      cliente,
      localidad,
      total: `$${total.toLocaleString("es-AR")}`,
      estado: "Pendiente",
      pago,
      detalles: detallesFinales,
    };
    setPedidos(prev => [nuevo, ...prev]);
    setFiltro("Todos");
    setModalAbierto(false);
    setCantidad(1);
    setDetalles([]);
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

      {puedeCrear && modalAbierto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"><form onSubmit={crearPedido} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h3 className="text-xl font-bold text-gray-900">Crear nuevo pedido</h3><button type="button" onClick={() => setModalAbierto(false)} className="text-2xl text-gray-400">×</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Cliente<select value={cliente} onChange={e => setCliente(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3"><option>María Gómez</option><option>Juan Pérez</option><option>Ana Rodríguez</option></select></label><label className="text-sm font-medium text-gray-700">Localidad<select value={localidad} onChange={e => setLocalidad(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3"><option>La Falda</option><option>Huerta Grande</option><option>Valle Hermoso</option><option>Casa Grande</option><option>Villa Giardino</option></select></label><label className="text-sm font-medium text-gray-700">Producto<select required disabled={cargandoProductos || productos.length === 0} value={producto} onChange={e => setProducto(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">{productos.map(item => <option key={item.id} value={item.nombre}>{item.nombre} — ${item.precio.toLocaleString("es-AR")} ({item.stock_actual} disponibles)</option>)}</select></label><label className="text-sm font-medium text-gray-700">Cantidad<input type="number" min="1" max={productoSeleccionado?.stock_actual || undefined} required value={cantidad} onChange={e => setCantidad(Math.max(1, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3" /></label></div><button type="button" onClick={agregarProducto} className="w-full rounded-xl border border-primary py-3 font-bold text-primary">+ Agregar producto al pedido</button>{detalles.length > 0 && <div className="space-y-2 rounded-xl bg-gray-50 p-3">{detalles.map((item, index) => <div key={index} className="flex justify-between text-sm"><span>{item.cantidad} × {item.producto}</span><button type="button" onClick={() => setDetalles(prev => prev.filter((_, i) => i !== index))} className="text-red-500">Quitar</button></div>)}</div>}<label className="block text-sm font-medium text-gray-700">Método de pago<select value={pago} onChange={e => setPago(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3"><option>A confirmar</option><option>Efectivo</option><option>Transferencia</option><option>Fiado</option></select></label><div className="flex items-center justify-between rounded-xl bg-blue-50 p-4"><span className="font-medium text-gray-600">Total estimado</span><strong className="text-2xl text-primary">${total.toLocaleString("es-AR")}</strong></div><div className="flex gap-3 pt-2"><button type="button" onClick={() => setModalAbierto(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600">Cancelar</button><button type="submit" disabled={cargandoProductos || productos.length === 0} className="btn-primary flex-1 disabled:opacity-50">Crear pedido</button></div></form></div>}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {["Pendiente", "Asignado", "En reparto", "Entregado"].map((estado, index) => <div key={estado} className={`card border-l-4 ${["border-warning", "border-primary", "border-accent", "border-success"][index]}`}><p className="text-xs font-bold uppercase tracking-wider text-muted">{estado === "En reparto" ? estado : `${estado}s`}</p><p className="mt-2 text-3xl font-black text-gray-900">{pedidos.filter(p => p.estado === estado).length}</p></div>)}
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex gap-2 overflow-x-auto border-b border-gray-100 p-4">{estados.map(estado => <button key={estado} onClick={() => setFiltro(estado)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${filtro === estado ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{estado}</button>)}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b border-gray-100 bg-gray-50 text-xs tracking-wider text-gray-500"><th className="p-4">PEDIDO</th><th className="p-4">CLIENTE</th><th className="p-4">LOCALIDAD</th><th className="p-4">TOTAL</th><th className="p-4">ESTADO</th><th className="p-4">PAGO</th></tr></thead><tbody className="divide-y divide-gray-100">{pedidosFiltrados.map(pedido => <Fragment key={pedido.id}><tr onClick={() => setPedidoAbierto(pedidoAbierto === pedido.id ? null : pedido.id)} className="cursor-pointer hover:bg-gray-50"><td className="p-4 font-bold text-primary">{pedidoAbierto === pedido.id ? "⌄" : "›"} {pedido.id}</td><td className="p-4 font-bold text-gray-900">{pedido.cliente}</td><td className="p-4 text-gray-600">{pedido.localidad}</td><td className="p-4 font-bold text-gray-900">{pedido.total}</td><td className="p-4"><span className={pedido.estado === "Entregado" ? "badge-success" : pedido.estado === "Pendiente" ? "badge-warning" : "badge-success"}>{pedido.estado}</span></td><td className="p-4 text-gray-600">{pedido.pago}</td></tr>{pedidoAbierto === pedido.id && <tr><td colSpan={6} className="bg-blue-50/50 px-8 py-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Detalle del pedido</p><div className="space-y-2">{pedido.detalles.map((detalle, index) => <div key={index} className="flex justify-between text-sm"><span>{detalle.cantidad} × {detalle.producto}</span><span className="font-bold">${(detalle.precio * detalle.cantidad).toLocaleString("es-AR")}</span></div>)}</div></td></tr>}</Fragment>)}</tbody></table></div>
        {pedidosFiltrados.length === 0 && <p className="p-8 text-center text-muted">No hay pedidos en este estado.</p>}
      </section>
    </main>
  );
}
