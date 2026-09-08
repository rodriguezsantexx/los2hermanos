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
  const [paso, setPaso] = useState(1);
  const [cliente, setCliente] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
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
  const clienteSeleccionado = clientes.find((item) => item.id === cliente);
  const localidadId =
    clienteSeleccionado?.localidad_id || localidad || localidades[0]?.id || "";
  const total = productos.reduce(
    (sum, item) => sum + (carrito[item.id] || 0) * item.precio,
    0
  );
  const clientesFiltrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase())
  );
  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase())
  );
  const puedeContinuar =
    paso === 1 ? !!cliente : Object.keys(carrito).length > 0;

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

  const crearPedido = async () => {
    if (!puedeCrear) return;
    const detallesFinales = Object.entries(carrito)
      .map(([producto_id, cantidad]) => {
        const prod = productos.find((p) => p.id === producto_id);
        return prod
          ? { producto_id, cantidad, precio_unitario: prod.precio }
          : null;
      })
      .filter(
        (d): d is { producto_id: string; cantidad: number; precio_unitario: number } =>
          d !== null
      );
    if (!detallesFinales.length) {
      alert("Debes agregar al menos un producto al pedido");
      return;
    }

    const payload = {
      cliente_id: cliente,
      localidad_id: localidadId,
      metodo_pago: pago === "A confirmar" ? null : pago,
      tipo_pedido: tipoPedido,
      detalles: detallesFinales,
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
      setPaso(1);
      setCarrito({});
      setTipoPedido("Envío");
      setPago("A confirmar");

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

  const sumar = (id: string) =>
    setCarrito((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

  const restar = (id: string) =>
    setCarrito((prev) => {
      const nueva = { ...prev };
      const cant = (nueva[id] || 0) - 1;
      if (cant <= 0) delete nueva[id];
      else nueva[id] = cant;
      return nueva;
    });

  const abrirModal = () => {
    setPaso(1);
    setCarrito({});
    setBusquedaCliente("");
    setBusquedaProducto("");
    setPago("A confirmar");
    setTipoPedido("Envío");
    setModalAbierto(true);
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
          <button onClick={abrirModal} className="btn-primary w-full md:w-auto">
            <span className="text-xl">+</span> Nuevo pedido
          </button>
        )}
      </header>

      {puedeCrear && modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h3 className="text-lg font-bold text-gray-900">Nuevo pedido</h3>
              <button type="button" onClick={() => setModalAbierto(false)} className="text-2xl text-gray-400">×</button>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-center gap-1 px-4 pt-4">
              {["Cliente", "Productos", "Pago"].map((label, i) => {
                const n = i + 1;
                const activo = paso === n;
                const completo = paso > n;
                return (
                  <Fragment key={label}>
                    {i > 0 && (
                      <div className={`h-0.5 w-8 rounded ${paso > i ? "bg-primary" : "bg-gray-200"}`} />
                    )}
                    <div className="flex flex-col items-center gap-1">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                        completo || activo ? "bg-primary text-white" : "bg-gray-100 text-gray-400"
                      }`}>
                        {completo ? "✓" : n}
                      </div>
                      <span className={`text-[10px] font-bold ${activo || completo ? "text-primary" : "text-gray-400"}`}>
                        {label}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {/* Cliente seleccionado */}
            {paso >= 2 && clienteSeleccionado && (
              <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                <span className="truncate text-sm font-bold text-gray-800">👤 {clienteSeleccionado.nombre}</span>
                <button type="button" onClick={() => setPaso(1)} className="shrink-0 text-xs font-bold text-primary">
                  Cambiar
                </button>
              </div>
            )}

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto p-4">
              {paso === 1 && (
                <div className="space-y-3">
                  <input
                    type="search"
                    placeholder="🔍 Buscar cliente..."
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3"
                  />
                  <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                    {clientesFiltrados.length === 0 && (
                      <p className="p-4 text-center text-sm text-muted">No se encontraron clientes.</p>
                    )}
                    {clientesFiltrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCliente(c.id);
                          setPaso(2);
                        }}
                        className={`w-full rounded-xl border-2 p-4 text-left transition-colors active:scale-[0.98] ${
                          cliente === c.id ? "border-primary bg-primary/5" : "border-gray-200 bg-white"
                        }`}
                      >
                        <p className="font-bold text-gray-900">{c.nombre}</p>
                        <p className="mt-0.5 text-xs text-muted">📍 {c.localidades?.nombre || "Sin localidad"}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paso === 2 && (
                <div className="space-y-3">
                  <input
                    type="search"
                    placeholder="🔍 Buscar producto..."
                    value={busquedaProducto}
                    onChange={(e) => setBusquedaProducto(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3"
                  />
                  <div className="max-h-[45vh] space-y-2 overflow-y-auto">
                    {productosFiltrados.length === 0 && (
                      <p className="p-4 text-center text-sm text-muted">No se encontraron productos.</p>
                    )}
                    {productosFiltrados.map((p) => {
                      const cant = carrito[p.id] || 0;
                      const sinStock = p.stock_actual <= 0;
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${
                            sinStock ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold text-gray-900">{p.nombre}</p>
                            <p className="text-xs text-muted">
                              ${p.precio.toLocaleString("es-AR")} · Stock: {p.stock_actual}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => restar(p.id)}
                              disabled={cant === 0}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-700 disabled:opacity-30 active:scale-95"
                            >
                              −
                            </button>
                            <span className="w-6 text-center text-lg font-black text-gray-900">{cant}</span>
                            <button
                              type="button"
                              onClick={() => sumar(p.id)}
                              disabled={sinStock || cant >= p.stock_actual}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xl font-bold text-white disabled:opacity-30 active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {paso === 3 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Método de pago</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {[
                        { clave: "Efectivo", icono: "💵" },
                        { clave: "Transferencia", icono: "🏦" },
                        { clave: "A confirmar", icono: "⏳" },
                      ].map((m) => (
                        <button
                          key={m.clave}
                          type="button"
                          onClick={() => setPago(m.clave)}
                          className={`rounded-xl border-2 px-2 py-3 text-sm font-bold transition-colors active:scale-95 ${
                            pago === m.clave
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {m.icono} {m.clave}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Tipo de pedido</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        { clave: "Envío", icono: "🚚" },
                        { clave: "Local", icono: "🏪" },
                      ].map((t) => (
                        <button
                          key={t.clave}
                          type="button"
                          onClick={() => setTipoPedido(t.clave)}
                          className={`rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors active:scale-95 ${
                            tipoPedido === t.clave
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {t.icono} {t.clave}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-blue-50 p-4">
                    <span className="font-medium text-gray-600">Total</span>
                    <strong className="text-2xl text-primary">${total.toLocaleString("es-AR")}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-gray-100 p-4">
              <div className="shrink-0">
                <p className="text-xs text-muted">Total</p>
                <p className="text-xl font-black text-gray-900">${total.toLocaleString("es-AR")}</p>
              </div>
              <div className="flex flex-1 gap-2">
                {paso > 1 && (
                  <button
                    type="button"
                    onClick={() => setPaso(paso - 1)}
                    className="rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600 active:scale-95"
                  >
                    ←
                  </button>
                )}
                {paso < 3 ? (
                  <button
                    type="button"
                    onClick={() => setPaso(paso + 1)}
                    disabled={!puedeContinuar}
                    className="btn-primary flex-1 disabled:opacity-40"
                  >
                    Continuar →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={crearPedido}
                    disabled={cargandoProductos || productos.length === 0}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    ✓ Crear pedido
                  </button>
                )}
              </div>
            </div>
          </div>
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
