"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type DashboardMetrics = { ventas_total: number; pedidos_total: number; pedidos_por_estado: Record<string, number>; stock_bajo: { id: string; nombre: string; stock_actual: number }[] };

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [pedidosRecientes, setPedidosRecientes] = useState<any[]>([]);

  useEffect(() => { 
    apiFetch<DashboardMetrics>("/api/finanzas/metricas/resumen").then(setMetrics).catch(() => undefined);
    apiFetch<any[]>("/api/pedidos").then(data => setPedidosRecientes((data || []).slice(0, 5))).catch(() => undefined);
  }, []);
  const pedidos = metrics?.pedidos_total ?? 0;
  const entregados = metrics?.pedidos_por_estado?.Entregado ?? 0;
  const pendientes = (metrics?.pedidos_por_estado?.Pendiente ?? 0) + (metrics?.pedidos_por_estado?.Asignado ?? 0) + (metrics?.pedidos_por_estado?.["En reparto"] ?? 0);
  return (
    <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Hola 👋, Admin</h2>
          <p className="text-muted text-lg mt-1">Resumen de hoy en tiempo real.</p>
        </div>
        <button className="btn-primary w-full md:w-auto shadow-primary/30"><span className="text-xl">+</span> Nuevo Pedido</button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="card !bg-primary !text-white border-none shadow-lg shadow-primary/20"><p className="text-blue-200 font-medium text-sm tracking-wider">VENTAS</p><p className="text-white text-3xl md:text-4xl font-black mt-2 drop-shadow-sm">${(metrics?.ventas_total ?? 0).toLocaleString("es-AR")}</p></div>
        <div className="card"><p className="text-muted font-medium text-sm tracking-wider">PEDIDOS</p><p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">{pedidos}</p></div>
        <div className="card border-l-4 border-l-success"><p className="text-muted font-medium text-sm tracking-wider">ENTREGADOS</p><p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">{entregados}</p></div>
        <div className="card border-l-4 border-l-warning"><p className="text-muted font-medium text-sm tracking-wider">PENDIENTES</p><p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">{pendientes}</p></div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="md:col-span-2 card space-y-4">
          <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">Pedidos Recientes</h3><button className="text-primary font-medium hover:underline">Ver todos</button></div>
          <div className="space-y-4">
            {pedidosRecientes.length > 0 ? pedidosRecientes.map(p => (
              <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-bold text-gray-600 border border-gray-100">
                    {p.id.substring(0, 4).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{p.clientes?.nombre || "Cliente Desconocido"}</p>
                    <p className="text-sm text-muted">📍 {p.localidades?.nombre || p.clientes?.direccion || "Sin dirección"}</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <p className="font-bold text-lg">${p.total}</p>
                  <span className={p.estado === 'Entregado' ? 'badge-success' : 'badge-warning'}>{p.estado}</span>
                </div>
              </div>
            )) : <p className="text-gray-500 text-center py-4">No hay pedidos recientes.</p>}
          </div>
        </section>

        <section className="card space-y-4 border-l-4 border-l-error flex flex-col">
          <div className="flex items-center gap-2 mb-4"><span className="text-xl">⚠️</span><h3 className="text-xl font-bold">Stock Bajo</h3></div>
          <div className="space-y-3 flex-1">
            {metrics?.stock_bajo && metrics.stock_bajo.length > 0 ? metrics.stock_bajo.map(s => (
              <div key={s.id} className="flex justify-between items-center p-3 border-b border-gray-100 last:border-0">
                <span className="font-medium text-gray-700">{s.nombre}</span>
                <span className="badge-error">{s.stock_actual} un.</span>
              </div>
            )) : <p className="text-gray-500 text-center py-4">Stock en niveles óptimos.</p>}
          </div>
          <button className="w-full mt-auto btn-secondary">Reponer Stock</button>
        </section>
      </div>
    </main>
  );
}
