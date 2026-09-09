"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications, type Notificacion } from "@/context/NotificationContext";

const ICONO_TIPO: Record<string, string> = {
  nuevo_pedido: "🆕",
  pedido_en_reparto: "🚚",
  pedido_entregado: "✅",
  gasto_registrado: "⛽",
};

const COLOR_TIPO: Record<string, string> = {
  nuevo_pedido: "bg-amber-100",
  pedido_en_reparto: "bg-indigo-100",
  pedido_entregado: "bg-emerald-100",
  gasto_registrado: "bg-orange-100",
};

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export default function NotificationBell({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  const { notificaciones, unreadNotificaciones, marcarNotificacionesLeidas } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click afuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) marcarNotificacionesLeidas();
  };

  const irANotificacion = (n: Notificacion) => {
    setOpen(false);
    if (n.pedido_id) {
      router.push(`/pedidos?id=${n.pedido_id}`);
    } else {
      router.push("/pedidos");
    }
  };

  const bellClase =
    variant === "mobile"
      ? "relative flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-2xl shadow-sm ring-1 ring-gray-100"
      : "relative flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-xl ring-1 ring-gray-100 hover:bg-gray-100 transition-colors";

  const panelClase =
    variant === "mobile"
      ? "absolute right-0 top-14 z-[70] w-[min(92vw,340px)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-100"
      : "absolute right-0 top-12 z-[70] w-[min(92vw,340px)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-100";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificaciones"
        className={bellClase}
      >
        🔔
        {unreadNotificaciones > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white animate-pulse shadow-sm">
            {unreadNotificaciones > 99 ? "99+" : unreadNotificaciones}
          </span>
        )}
      </button>

      {open && (
        <div className={panelClase}>
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-black text-gray-900">Notificaciones</p>
            {notificaciones.length > 0 && (
              <button
                type="button"
                onClick={marcarNotificacionesLeidas}
                className="text-xs font-bold text-primary"
              >
                Marcar leídas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">Sin notificaciones por ahora.</p>
            ) : (
              notificaciones.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => irANotificacion(n)}
                  className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    n.leida ? "opacity-60" : ""
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${COLOR_TIPO[n.tipo] || "bg-gray-100"}`}>
                    {ICONO_TIPO[n.tipo] || "🔔"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900">{n.titulo}</span>
                    {n.mensaje && <span className="mt-0.5 block text-xs text-gray-600">{n.mensaje}</span>}
                    <span className="mt-1 block text-[10px] font-medium text-muted">{tiempoRelativo(n.created_at)}</span>
                  </span>
                  {!n.leida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}