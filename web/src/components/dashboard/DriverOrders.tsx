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
  return {
    ...pedido,
    cliente: pedido.clientes?.nombre || "Cliente sin nombre",
    localidad: pedido.localidades?.nombre || "Sin localidad",
    detalle:
      pedido.detalle_pedidos
        ?.map(
          (detalle) =>
            `${detalle.productos?.nombre || "Producto"} × ${detalle.cantidad}`
        )
        .join(" · ") || "Sin detalle",
  };
}

const estiloBadgeEstado = (estado: string) => {
  if (estado === "Entregado")
    return "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700";
  if (estado === "En reparto")
    return "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700";
  return "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700";
};

export default function DriverOrders({ localidad }: { localidad: string }) {
  const [pedidos, setPedidos] = useState<DriverOrder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = async () => {
    try {
      setPedidos((await apiFetch<ApiPedido[]>("/api/pedidos")).map(normalize));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus pedidos");
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    cargar();
  }, []);

  const enProceso = async (pedido: DriverOrder) => {
    try {
      await apiFetch(`/api/pedidos/${pedido.id}/estado`, { method: "POST" });
      setPedidos((prev) =>
        prev.map((item) =>
          item.id === pedido.id ? { ...item, estado: "En reparto" } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    }
  };

  const entregar = async (pedido: DriverOrder) => {
    const metodo = pedido.metodo_pago || "Efectivo";
    try {
      await apiFetch(`/api/pedidos/${pedido.id}/entregar`, {
        method: "POST",
        body: JSON.stringify({ estado: "Entregado", metodo_pago: metodo }),
      });
      setPedidos((prev) =>
        prev.map((item) =>
          item.id === pedido.id ? { ...item, estado: "Entregado" } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la entrega");
    }
  };

  const pedidosActivos =
    pedidos.filter(
      (pedido) => pedido.estado !== "Entregado" && pedido.estado !== "Cancelado"
    ) ;
  const pedidosEntregados = pedidos.filter(
    (pedido) => pedido.estado === "Entregado"
  );

  const CardOrden = ({ pedido }: { pedido: DriverOrder }) => (
    <article className="card !p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight text-gray-900 truncate">
            {pedido.cliente}
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            📍 {pedido.localidad}
          </p>
        </div>
        <span className={estiloBadgeEstado(pedido.estado)}>{pedido.estado}</span>
      </div>

      <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
        🛒 {pedido.detalle}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">Total</p>
          <p className="text-xl font-black text-gray-900">
            ${Number(pedido.total).toLocaleString("es-AR")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Pago</p>
          <p className="text-sm font-semibold text-gray-700">
            {pedido.metodo_pago || "A confirmar"}
            {pedido.pago_verificado && (
              <span className="ml-1 text-emerald-600">✓ verificado</span>
            )}
          </p>
        </div>
      </div>

      {pedido.estado !== "Entregado" &&
        pedido.estado !== "Cancelado" && (
          <div className="flex gap-2 pt-1">
            {pedido.estado !== "En reparto" && (
              <button
                onClick={() => enProceso(pedido)}
                className="flex-1 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 active:scale-95 transition-transform"
              >
                En proceso
              </button>
            )}
            <button
              onClick={() => entregar(pedido)}
              className="flex-1 rounded-xl btn-primary !shadow-none active:scale-95 transition-transform"
            >
              ✓ Entregar
            </button>
          </div>
        )}
    </article>
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 pb-24 md:p-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-primary">
          Reparto
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Mis pedidos</h1>
        <p className="mt-1 text-muted">
          Pedidos asignados para {localidad}.
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm text-muted">Por entregar</p>
          <p className="mt-2 text-3xl font-black text-gray-900">
            {pedidosActivos.length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Entregados hoy</p>
          <p className="mt-2 text-3xl font-black text-gray-900">
            {pedidosEntregados.length}
          </p>
        </div>
      </section>

      {cargando && (
        <p className="p-8 text-center text-muted">Cargando pedidos…</p>
      )}

      {!cargando && pedidos.length === 0 && (
        <p className="p-8 text-center text-muted">No hay pedidos todavía.</p>
      )}

      {!cargando && pedidosActivos.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-gray-900">Para entregar</h2>
          <div className="space-y-3">
            {pedidosActivos.map((pedido) => (
              <CardOrden key={pedido.id} pedido={pedido} />
            ))}
          </div>
        </>
      )}

      {!cargando && pedidosEntregados.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-gray-900">Historial de hoy</h2>
          <div className="space-y-3 opacity-80">
            {pedidosEntregados.map((pedido) => (
              <CardOrden key={pedido.id} pedido={pedido} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
