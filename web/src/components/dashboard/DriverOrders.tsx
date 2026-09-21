"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type ApiPedido = {
  id: string;
  total: number;
  estado: string;
  metodo_pago?: string;
  pago_verificado?: boolean;
  mp_link?: string | null;
  mp_qr_data?: string | null;
  direccion?: string | null;
  clientes?: { nombre?: string; direccion?: string } | null;
  localidades?: { nombre?: string } | null;
  detalle_pedidos?: { cantidad: number; productos?: { nombre?: string; marca?: string } | null }[];
  updated_at?: string;
};

type DriverOrder = ApiPedido & { cliente: string; localidad: string; direccion: string; detalle: string };

function normalize(pedido: ApiPedido): DriverOrder {
  return {
    ...pedido,
    cliente: pedido.clientes?.nombre || "Cliente sin nombre",
    localidad: pedido.localidades?.nombre || "Sin localidad",
    direccion: pedido.direccion || pedido.clientes?.direccion || "",
    detalle:
      pedido.detalle_pedidos
        ?.map(
          (detalle) =>
            `${detalle.productos?.nombre || "Producto"}${detalle.productos?.marca ? ` (${detalle.productos.marca})` : ""} × ${detalle.cantidad}`
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

    const channel = supabase
      .channel("pedidos_chofer")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => {
          cargar();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
  const hoy = new Date().toDateString();
  const pedidosEntregados = pedidos.filter((pedido) => {
    if (pedido.estado !== "Entregado") return false;
    if (!pedido.updated_at) return true;
    return new Date(pedido.updated_at).toDateString() === hoy;
  });

  const efectivoARendir = pedidosEntregados
    .filter(p => !p.metodo_pago || p.metodo_pago === "Efectivo")
    .reduce((acc, p) => acc + (Number(p.total) || 0), 0);
    
  const pagosDigitales = pedidosEntregados
    .filter(p => p.metodo_pago === "Transferencia" || p.metodo_pago === "MercadoPago")
    .reduce((acc, p) => acc + (Number(p.total) || 0), 0);

  const CardOrden = ({ pedido }: { pedido: DriverOrder }) => (
    <article className="card !p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight text-gray-900 truncate">
            {pedido.cliente}
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            📍 {pedido.localidad}
            {pedido.direccion ? ` · ${pedido.direccion}` : ""}
          </p>
        </div>
        <span className={estiloBadgeEstado(pedido.estado)}>{pedido.estado}</span>
      </div>

      <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700 mb-3">
        🛒 {pedido.detalle}
      </div>

      {pedido.direccion && pedido.estado !== "Entregado" && (
        <a 
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pedido.direccion}, ${pedido.localidad}, Argentina`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-white border border-gray-200 p-3 text-sm font-bold text-gray-700 active:scale-95 transition-transform mb-3 shadow-sm"
        >
          📍 Abrir en Google Maps
        </a>
      )}

      <div className="flex items-center justify-between text-sm">
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

      {(pedido.metodo_pago === "MercadoPago" || pedido.metodo_pago === "Transferencia") &&
        !pedido.pago_verificado &&
        pedido.estado !== "Entregado" &&
        (pedido.mp_qr_data || pedido.mp_link) && (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-sky-50 p-4">
            <p className="text-sm font-bold text-sky-700">
              📱 Escaneá para pagar
            </p>
            <QRCodeSVG value={pedido.mp_qr_data || pedido.mp_link!} size={180} />
            <p className="text-center text-xs text-muted">
              {pedido.mp_qr_data 
                ? "QR Interoperable: Podés escanear con MODO, Ualá, o Mercado Pago."
                : "El cliente escanea el QR y paga al instante. El pago se verifica solo."}
            </p>
          </div>
        )}

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
        <div className="card !bg-primary text-white border-none shadow-md shadow-primary/20">
          <p className="text-sm font-medium text-white/80">Por entregar</p>
          <p className="mt-1 text-3xl font-black">
            {pedidosActivos.length}
          </p>
        </div>
        <div className="card bg-white border-gray-100 shadow-sm">
          <p className="text-sm text-muted">Entregados hoy</p>
          <p className="mt-1 text-3xl font-black text-gray-900">
            {pedidosEntregados.length}
          </p>
        </div>
      </section>

      <section className="card bg-emerald-50 border-emerald-100 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-3">Resumen de Caja (Hoy)</h3>
        <div className="flex justify-between items-center mb-2">
          <span className="text-emerald-700 font-bold">💵 Efectivo a rendir</span>
          <span className="text-2xl font-black text-emerald-900">${efectivoARendir.toLocaleString('es-AR')}</span>
        </div>
        <div className="flex justify-between items-center text-sm pt-2 border-t border-emerald-200/50">
          <span className="text-emerald-600/90 font-medium">📱 Pagos digitales</span>
          <span className="font-bold text-emerald-700/90">${pagosDigitales.toLocaleString('es-AR')}</span>
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
