"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type ApiPedido = {
  id: string;
  total: number;
  estado: string;
  metodo_pago?: string;
  pago_verificado?: boolean;
  created_at?: string;
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
        ?.map((d) => `${d.productos?.nombre || "Producto"} × ${d.cantidad}`)
        .join(" · ") || "Sin detalle",
  };
}

const esHoy = (iso?: string) => {
  if (!iso) return false;
  const fecha = new Date(iso);
  const hoy = new Date();
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
};

const formatearHora = (iso?: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
};

const estiloBadge = (estado: string) => {
  if (estado === "Entregado")
    return "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700";
  if (estado === "En reparto")
    return "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700";
  return "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700";
};

export default function DriverHome({ localidad }: { localidad: string }) {
  const [pedidos, setPedidos] = useState<DriverOrder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ApiPedido[]>("/api/pedidos")
      .then((data) => setPedidos(data.map(normalize)))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar tus pedidos"))
      .finally(() => setCargando(false));
  }, []);

  const activos = pedidos.filter((p) => p.estado !== "Entregado" && p.estado !== "Cancelado");
  const entregadosHoy = pedidos.filter((p) => p.estado === "Entregado" && esHoy(p.created_at));
  const recaudadoHoy = entregadosHoy.reduce((sum, p) => sum + Number(p.total || 0), 0);

  // Próximos: pendientes más antiguos primero (los que llevan más tiempo esperando)
  const proximos = [...activos].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  }).slice(0, 5);

  const zonaSlug = localidad.toLowerCase().includes("falda") ? "la-falda" : "huerta-grande";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 pb-24 md:p-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Reparto</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Hola 👋</h1>
        <p className="mt-1 text-muted">Resumen de tu jornada en {localidad}.</p>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>
      )}

      {/* Tarjetas de resumen */}
      <section className="grid grid-cols-3 gap-3">
        <div className="card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Por entregar</p>
          <p className="mt-2 text-3xl font-black text-gray-900">{activos.length}</p>
        </div>
        <div className="card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Entregados hoy</p>
          <p className="mt-2 text-3xl font-black text-emerald-600">{entregadosHoy.length}</p>
        </div>
        <div className="card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Recaudado hoy</p>
          <p className="mt-2 text-lg font-black leading-tight text-gray-900">
            ${recaudadoHoy.toLocaleString("es-AR")}
          </p>
        </div>
      </section>

      {/* Próximos pedidos */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Próximos pedidos</h2>
          <Link href={`/chofer/${zonaSlug}/pedidos`} className="text-sm font-bold text-primary hover:underline">
            Ver todos
          </Link>
        </div>

        {cargando ? (
          <p className="p-6 text-center text-muted">Cargando pedidos…</p>
        ) : proximos.length === 0 ? (
          <div className="card !p-6 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-2 font-bold text-gray-900">¡Sin pedidos pendientes!</p>
            <p className="mt-1 text-sm text-muted">Por ahora no tenés entregas en cola.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {proximos.map((pedido) => (
              <article key={pedido.id} className="card !p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold leading-tight text-gray-900">
                      {pedido.cliente}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted">📍 {pedido.localidad}</p>
                  </div>
                  <span className={estiloBadge(pedido.estado)}>{pedido.estado}</span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    🕐 {formatearHora(pedido.created_at)}
                  </span>
                  <span className="font-bold text-gray-900">
                    ${Number(pedido.total).toLocaleString("es-AR")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Acceso rápido */}
      <Link
        href={`/chofer/${zonaSlug}/pedidos`}
        className="btn-primary w-full !shadow-none active:scale-95 transition-transform"
      >
        📦 Ver todos los pedidos
      </Link>
    </main>
  );
}