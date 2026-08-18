"use client";

import { useEffect, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch } from "@/lib/api";

type Metricas = { pedidos_total: number; pedidos_por_estado: Record<string, number>; ventas_total: number; ingresos_caja: number; egresos_caja: number; saldo_caja: number; cuenta_corriente_total: number; stock_bajo: { id: string; nombre: string; stock_actual: number; stock_minimo: number }[] };

function MetricasContent() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<Metricas>("/api/finanzas/metricas/resumen").then(setMetricas).catch(err => setError(err.message)); }, []);
  if (error) return <main className="p-8"><p className="rounded-xl bg-red-50 p-4 text-red-600">{error}</p></main>;
  if (!metricas) return <main className="flex min-h-full items-center justify-center p-8 text-muted">Cargando métricas…</main>;
  return <main className="flex-1 space-y-6 p-4 md:p-8"><header><p className="text-sm font-bold uppercase tracking-wider text-primary">Administración</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Métricas</h1><p className="mt-1 text-muted">Resumen operativo y financiero del día.</p></header><section className="grid grid-cols-2 gap-4 lg:grid-cols-4"><div className="card"><p className="text-sm text-muted">Ventas</p><p className="mt-2 text-3xl font-black">${metricas.ventas_total.toLocaleString("es-AR")}</p></div><div className="card"><p className="text-sm text-muted">Pedidos</p><p className="mt-2 text-3xl font-black">{metricas.pedidos_total}</p></div><div className="card"><p className="text-sm text-muted">Saldo de caja</p><p className="mt-2 text-3xl font-black">${metricas.saldo_caja.toLocaleString("es-AR")}</p></div><div className="card"><p className="text-sm text-muted">Cuenta corriente</p><p className="mt-2 text-3xl font-black">${metricas.cuenta_corriente_total.toLocaleString("es-AR")}</p></div></section><section className="grid gap-6 lg:grid-cols-2"><div className="card"><h2 className="mb-4 text-xl font-bold">Pedidos por estado</h2><div className="space-y-3">{Object.entries(metricas.pedidos_por_estado).map(([estado, total]) => <div key={estado} className="flex justify-between rounded-xl bg-gray-50 p-3"><span>{estado}</span><strong>{total}</strong></div>)}</div></div><div className="card"><h2 className="mb-4 text-xl font-bold">Stock bajo</h2><div className="space-y-3">{metricas.stock_bajo.map(item => <div key={item.id} className="flex justify-between rounded-xl bg-gray-50 p-3"><span>{item.nombre}</span><strong>{item.stock_actual} / mín. {item.stock_minimo}</strong></div>)}{metricas.stock_bajo.length === 0 && <p className="text-muted">No hay alertas de stock.</p>}</div></div></section></main>;
}

export default function MetricasPage() { return <RoleGuard allowedRole="ADMIN"><MetricasContent /></RoleGuard>; }
