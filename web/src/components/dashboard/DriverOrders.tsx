"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ApiPedido = {
  id: string;
  total: number;
  estado: string;
  metodo_pago?: string;
  pago_verificado?: boolean;
  clientes?: { nombre?: string } | null;
  localidades?: { nombre?: string } | null;
  detalle_pedidos?: { cantidad: number; productos?: { nombre?: string } | null }[];
};

type DriverOrder = ApiPedido & { cliente: string; localidad: string; detalle: string };

function normalize(pedido: ApiPedido): DriverOrder {
  return { ...pedido, cliente: pedido.clientes?.nombre || "Cliente sin nombre", localidad: pedido.localidades?.nombre || "Sin localidad", detalle: pedido.detalle_pedidos?.map(detalle => `${detalle.productos?.nombre || "Producto"} × ${detalle.cantidad}`).join(" · ") || "Sin detalle" };
}

export default function DriverOrders({ localidad }: { localidad: string }) {
  const [pedidos, setPedidos] = useState<DriverOrder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = async () => {
    try { setPedidos((await apiFetch<ApiPedido[]>("/api/pedidos")).map(normalize)); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudieron cargar tus pedidos"); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const enProceso = async (pedido: DriverOrder) => {
    try {
      await apiFetch(`/api/pedidos/${pedido.id}/estado`, { method: "POST" });
      setPedidos(prev => prev.map(item => item.id === pedido.id ? { ...item, estado: "En reparto" } : item));
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cambiar el estado"); }
  };

  const entregar = async (pedido: DriverOrder) => {
    const metodo = pedido.metodo_pago || "Efectivo";
    try {
      await apiFetch(`/api/pedidos/${pedido.id}/entregar`, { method: "POST", body: JSON.stringify({ estado: "Entregado", metodo_pago: metodo }) });
      setPedidos(prev => prev.map(item => item.id === pedido.id ? { ...item, estado: "Entregado" } : item));
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar la entrega"); }
  };

  const pedidosPendientes = pedidos.filter(pedido => pedido.estado !== "Entregado" && pedido.estado !== "Cancelado");
  const pedidosEntregados = pedidos.filter(pedido => pedido.estado === "Entregado");

  return <main className="flex-1 space-y-6 p-4 md:p-8"><header><p className="text-sm font-bold uppercase tracking-wider text-primary">Reparto</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Mis pedidos</h1><p className="mt-1 text-muted">Pedidos asignados para {localidad}. Solo podés consultar y registrar entregas.</p></header>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}
    <section className="grid grid-cols-2 gap-4"><div className="card"><p className="text-sm text-muted">Pendientes</p><p className="mt-2 text-3xl font-black text-gray-900">{pedidosPendientes.length}</p></div><div className="card"><p className="text-sm text-muted">Entregados</p><p className="mt-2 text-3xl font-black text-gray-900">{pedidosEntregados.length}</p></div></section>
    <section className="card overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-gray-100 bg-gray-50 text-xs tracking-wider text-gray-500"><th className="p-4">PEDIDO</th><th className="p-4">CLIENTE</th><th className="p-4">LOCALIDAD</th><th className="p-4">DETALLE</th><th className="p-4">TOTAL</th><th className="p-4">PAGO</th><th className="p-4">ESTADO</th><th className="p-4">ACCIÓN</th></tr></thead><tbody className="divide-y divide-gray-100">{pedidos.map(pedido => <tr key={pedido.id}><td className="p-4 font-bold text-primary">{pedido.id.slice(0, 8)}</td><td className="p-4 font-bold text-gray-900">{pedido.cliente}</td><td className="p-4 text-gray-600">{pedido.localidad}</td><td className="p-4 text-gray-600">{pedido.detalle}</td><td className="p-4 font-bold">${Number(pedido.total).toLocaleString("es-AR")}</td><td className="p-4 text-xs font-medium text-gray-600">{pedido.metodo_pago || "A confirmar"} {pedido.pago_verificado && <span className="text-green-500 ml-1">✔</span>}</td><td className="p-4"><span className={pedido.estado === "Entregado" ? "badge-success" : pedido.estado === "En reparto" ? "badge-accent" : "badge-warning"}>{pedido.estado}</span></td><td className="p-4">{pedido.estado === "Entregado" ? <span className="text-sm font-bold text-green-600">Completado</span> : <div className="flex items-center gap-2">{pedido.estado !== "En reparto" && <button onClick={() => enProceso(pedido)} className="rounded-lg border border-accent bg-accent/10 px-3 py-2 text-xs font-bold text-accent hover:bg-accent/20 transition-colors">En proceso</button>}<button onClick={() => entregar(pedido)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors">Entregar</button></div>}</td></tr>)}</tbody></table></div>{cargando && <p className="p-8 text-center text-muted">Cargando pedidos…</p>}{!cargando && pedidos.length === 0 && <p className="p-8 text-center text-muted">No hay pedidos asignados para tu zona.</p>}</section>
  </main>;
}
