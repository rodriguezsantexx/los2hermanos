"use client";

import { Fragment, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getToken, getUser, logoutActive } from "@/lib/session";

type Producto = { id: string; nombre: string; precio: number; stock_actual: number };
type Detalle = { producto: string; cantidad: number; precio: number };
type Cliente = { id: string; nombre: string; localidad_id: string; localidades?: { nombre?: string } | null };
type Localidad = { id: string; nombre: string };

interface PedidoUI {
  uuid: string;
  id: string;
  cliente: string;
  direccion: string;
  localidad: string;
  tipo: string;
  total: string;
  estado: string;
  pago: string;
  pago_verificado?: boolean;
  mp_preference_id?: string | null;
  detalles: Detalle[];
}

const pedidosIniciales: PedidoUI[] = [];
const ESTADOS_META: { clave: string; etiqueta: string; borde: string; dot: string }[] = [
  { clave: "Pendiente", etiqueta: "Pendientes", borde: "border-warning", dot: "bg-amber-400" },
  { clave: "Asignado", etiqueta: "Asignados", borde: "border-primary", dot: "bg-blue-500" },
  { clave: "En reparto", etiqueta: "En reparto", borde: "border-accent", dot: "bg-yellow-400" },
  { clave: "Entregado", etiqueta: "Entregados", borde: "border-success", dot: "bg-emerald-500" },
];

const styleBadge = (estado: string) => {
  if (estado === "Entregado")
    return "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700";
  if (estado === "En reparto")
    return "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700";
  if (estado === "Asignado")
    return "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700";
  return "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700";
};

const infoPago = (pago: string) => {
  switch (pago) {
    case "Efectivo": return { icono: "💵", clase: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
    case "Transferencia": return { icono: "🏦", clase: "bg-blue-50 text-blue-700 ring-blue-200" };
    case "MercadoPago": return { icono: "📱", clase: "bg-sky-50 text-sky-700 ring-sky-200" };
    default: return { icono: "⏳", clase: "bg-gray-50 text-gray-600 ring-gray-200" };
  }
};

function PedidosContent() {
  const searchParams = useSearchParams();
  const [filtro, setFiltro] = useState("Todos");
  const [pedidos, setPedidos] = useState<PedidoUI[]>(pedidosIniciales);
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
  const pedidosFiltrados =
    filtro === "Todos" ? pedidos : pedidos.filter((p) => p.estado === filtro);
  const productoSeleccionado = productos.find((item) => item.id === producto);
  const total =
    detalles.reduce((sum, item) => sum + item.precio * item.cantidad, 0) +
    (productoSeleccionado?.precio || 0) * cantidad;

  useEffect(() => {
    try {
      const user = getUser();
      setPuedeCrear(user?.roles?.nombre === "ADMIN");
    } catch {
      setPuedeCrear(false);
    }

    const fetchPedidos = () => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
        .then((res) => {
          if (res.status === 401) {
            logoutActive();
            if (window.location.pathname !== "/login") window.location.href = "/login";
            return [];
          }
          return res.ok ? res.json() : [];
        })
        .then((data) => {
          if (Array.isArray(data)) {
            const pedidosFormateados: PedidoUI[] = data.map((p) => ({
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
                precio: d.precio_unitario,
              })),
            }));
            setPedidos(pedidosFormateados);

            const targetId = searchParams.get("id");
            if (targetId) setPedidoAbierto(targetId);
            const action = searchParams.get("action");
            if (action === "new") setModalAbierto(true);
          }
        })
        .catch(() => undefined);
    };

    fetchPedidos();

    (window as any).refreshPedidos = fetchPedidos;
  }, [searchParams]);

  useEffect(() => {
    if (!puedeCrear) {
      setCargandoProductos(false);
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("No se pudieron cargar los productos"))))
      .then((data: Producto[]) => {
        setProductos(data);
        if (data.length > 0) setProducto(data[0].id);
      })
      .catch((err) => alert(err instanceof Error ? err.message : "Error al cargar productos"))
      .finally(() => setCargandoProductos(false));
  }, [puedeCrear]);

  useEffect(() => {
    if (!puedeCrear) return;
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes`),
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/clientes/localidades`),
    ])
      .then(async ([clientesRes, localidadesRes]) => {
        if (!clientesRes.ok || !localidadesRes.ok)
          throw new Error("No se pudieron cargar clientes y localidades");
        const clientesData = (await clientesRes.json()) as Cliente[];
        const localidadesData = (await localidadesRes.json()) as Localidad[];
        setClientes(clientesData);
        setLocalidades(localidadesData);
        if (clientesData.length > 0) setCliente(clientesData[0].id);
        if (localidadesData.length > 0) setLocalidad(localidadesData[0].id);
      })
      .catch((err) => alert(err instanceof Error ? err.message : "Error al cargar datos del pedido"));
  }, [puedeCrear]);

  const crearPedido = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeCrear) return;
    const detallesFinales = [
      ...detalles,
      ...(productoSeleccionado
        ? [{ producto_id: productoSeleccionado.id, cantidad, precio_unitario: productoSeleccionado.precio }]
        : []),
    ];
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
        producto_id: d.producto_id || productos.find((pp) => pp.nombre === d.producto)?.id,
        cantidad: d.cantidad,
        precio_unitario: d.precio || d.precio_unitario,
      })),
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
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
    setDetalles((prev) => [
      ...prev,
      { producto: productoSeleccionado.nombre, cantidad, precio: productoSeleccionado.precio },
    ]);
    setCantidad(1);
  };

  const marcarEntregado = (uuid: string, pagoMetodo: string) => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/pedidos/${uuid}/entregar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ estado: "Entregado", metodo_pago: pagoMetodo }),
    }).then(() => {
      if (typeof (window as any).refreshPedidos === "function") (window as any).refreshPedidos();
    });
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 pb-28 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Operaciones</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Pedidos</h2>
          <p className="mt-1 text-muted">Consultá y gestioná los pedidos de tus clientes.</p>
        </div>
        {puedeCrear && (
          <button onClick={() => setModalAbierto(true)} className="btn-primary w-full md:w-auto">
            <span className="text-xl">+</span> Nuevo pedido
          </button>
        )}
      </header>

      {puedeCrear && modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <form onSubmit={crearPedido} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Crear nuevo pedido</h3>
              <button type="button" onClick={() => setModalAbierto(false)} className="text-2xl text-gray-400">×</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Cliente
                <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Localidad
                <select value={localidad} onChange={(e) => setLocalidad(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {localidades.map((l) => (<option key={l.id} value={l.id}>{l.nombre}</option>))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Producto
                <select required disabled={cargandoProductos || productos.length === 0} value={producto} onChange={(e) => setProducto(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {productos.map((item) => (<option key={item.id} value={item.id}>{item.nombre} — ${item.precio.toLocaleString("es-AR")} ({item.stock_actual})</option>))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Cantidad
                <input type="number" min="1" max={productoSeleccionado?.stock_actual || undefined} required value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3" />
              </label>
            </div>
            <button type="button" onClick={agregarProducto} className="w-full rounded-xl border border-primary bg-primary/5 px-4 py-3 font-bold text-primary">
              ➕ Agregar producto
            </button>
            {detalles.length > 0 && (
              <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                {detalles.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{d.producto} × {d.cantidad}</span>
                    <span className="font-bold text-gray-900">${(d.precio * d.cantidad).toLocaleString("es-AR")}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Tipo de pedido
                <select value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <option>Envío</option><option>Local</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Método de pago
                <select value={pago} onChange={(e) => setPago(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <option>A confirmar</option><option>Efectivo</option><option>Transferencia</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-blue-50 p-4">
              <span className="font-medium text-gray-600">Total estimado</span>
              <strong className="text-2xl text-primary">${total.toLocaleString("es-AR")}</strong>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalAbierto(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600">Cancelar</button>
              <button type="submit" disabled={cargandoProductos || productos.length === 0} className="btn-primary flex-1 disabled:opacity-50 shadow-primary/30">Crear pedido</button>
            </div>
          </form>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ESTADOS_META.map((meta) => (
          <div key={meta.clave} className={`card !p-4 border-l-4 ${meta.borde}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{meta.etiqueta}</p>
            <p className="mt-2 text-3xl font-black text-gray-900">
              {pedidos.filter((p) => p.estado === meta.clave).length}
            </p>
          </div>
        ))}
      </section>

      <section className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {estados.map((estado) => (
            <button
              key={estado}
              onClick={() => setFiltro(estado)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                filtro === estado ? "bg-primary text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
              }`}
            >
              {estado}
            </button>
          ))}
      </section>

      <section className="space-y-3">
        {pedidosFiltrados.map((pedido) => {
          const abierto = pedidoAbierto === pedido.uuid;
          return (
            <article
              key={pedido.uuid}
              className={`card !p-4 transition-colors ${abierto ? "ring-2 ring-primary/60" : ""}`}
            >
              <button
                onClick={() => setPedidoAbierto(abierto ? null : pedido.uuid)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">{pedido.id}</span>
                    {pedido.tipo === "Local" && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">LOCAL</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-base font-extrabold text-gray-900">{pedido.cliente}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    📍 {pedido.tipo === "Local" ? "Entrega local" : `${pedido.localidad} · ${pedido.direccion}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={styleBadge(pedido.estado)}>{pedido.estado}</span>
                  <span className="text-lg font-black text-gray-900">{pedido.total}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${infoPago(pedido.pago).clase}`}>
                    {infoPago(pedido.pago).icono} {pedido.pago}
                  </span>
                </div>
              </button>

              {abierto && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Detalle</p>
                    {pedido.detalles.length > 0 ? (
                      <ul className="space-y-1.5">
                        {pedido.detalles.map((d, idx) => (
                          <li key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{d.producto} × {d.cantidad}</span>
                            <span className="font-semibold text-gray-900">${(d.precio * d.cantidad).toLocaleString("es-AR")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">Sin detalle registrado.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Pago</span>
                    <span className="flex items-center gap-1.5 font-semibold text-gray-800">
                      {pedido.pago}
                      {(pedido.pago === "Transferencia" || pedido.pago === "MercadoPago") &&
                        (pedido.pago_verificado ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ Verificado</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">⏳ Pendiente</span>
                        ))}
                    </span>
                  </div>

                  {pedido.estado !== "Entregado" && puedeCrear && (
                    <button
                      onClick={() => marcarEntregado(pedido.uuid, pedido.pago)}
                      className="w-full rounded-xl btn-primary !shadow-none active:scale-95 transition-transform"
                    >
                      ✓ Marcar como Entregado
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {pedidosFiltrados.length === 0 && (
          <p className="p-8 text-center text-muted">No hay pedidos en este estado.</p>
        )}
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
