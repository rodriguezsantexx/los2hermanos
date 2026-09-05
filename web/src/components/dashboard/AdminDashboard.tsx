"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Movimiento = { id: string; tipo: "Ingreso" | "Egreso"; monto: number; metodo_pago: string; descripcion?: string; fecha: string };
type DashboardMetrics = { 
  ventas_total: number; 
  pedidos_total: number; 
  pedidos_por_estado: Record<string, number>; 
  stock_bajo: { id: string; nombre: string; stock_actual: number; stock_minimo: number }[];
  ingresos_caja: number; 
  egresos_caja: number; 
  saldo_caja: number; 
};
type CajaResumen = { ingresos: number; egresos: number; saldo: number; movimientos: Movimiento[] };

export default function AdminDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [pedidosRecientes, setPedidosRecientes] = useState<any[]>([]);

  const cargarDatos = async () => {
    apiFetch<DashboardMetrics>("/api/finanzas/metricas/resumen").then(setMetrics).catch(() => undefined);
    apiFetch<any[]>("/api/pedidos").then(data => setPedidosRecientes((data || []).slice(0, 5))).catch(() => undefined);
  };

  useEffect(() => { 
    cargarDatos();
  }, []);

  const pedidos = metrics?.pedidos_total ?? 0;
  const entregados = metrics?.pedidos_por_estado?.Entregado ?? 0;
  const pendientes = (metrics?.pedidos_por_estado?.Pendiente ?? 0) + (metrics?.pedidos_por_estado?.Asignado ?? 0) + (metrics?.pedidos_por_estado?.["En reparto"] ?? 0);

  return (
    <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Hola 👋, Admin</h2>
          <p className="text-muted text-lg mt-1">Resumen general y control operativo.</p>
        </div>
        <button onClick={() => router.push("/pedidos?action=new")} className="btn-primary w-full md:w-auto shadow-primary/30"><span className="text-xl">+</span> Nuevo Pedido</button>
      </header>

      {/* Tarjetas de Resumen (Métricas Clave) */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        <div onClick={() => router.push("/historial")} className="card !bg-primary !text-white border-none shadow-lg shadow-primary/20 cursor-pointer hover:scale-[1.02] transition-transform">
          <p className="text-blue-200 font-medium text-sm tracking-wider">VENTAS</p>
          <p className="text-white text-3xl md:text-4xl font-black mt-2 drop-shadow-sm">${(metrics?.ventas_total ?? 0).toLocaleString("es-AR")}</p>
        </div>
        <div className="card">
          <p className="text-muted font-medium text-sm tracking-wider">PEDIDOS</p>
          <p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">{pedidos}</p>
        </div>
        <div className="card">
          <p className="text-muted font-medium text-sm tracking-wider">SALDO CAJA</p>
          <p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">${(metrics?.saldo_caja ?? 0).toLocaleString("es-AR")}</p>
        </div>
      </section>

      {/* Sección Operativa (Pedidos y Stock) */}
      <h3 className="text-2xl font-bold text-gray-900 pt-4">Operaciones</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="md:col-span-2 card space-y-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Pedidos Recientes</h3>
            <div className="flex gap-4">
              <div className="text-sm">
                <span className="text-muted">Pendientes:</span> <span className="font-bold text-gray-900">{pendientes}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted">Entregados:</span> <span className="font-bold text-gray-900">{entregados}</span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {pedidosRecientes.length > 0 ? pedidosRecientes.map(p => (
              <div key={p.id} onClick={() => router.push(`/pedidos?id=${p.id}`)} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer border border-transparent hover:border-primary/20">
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
              <div key={s.id} onClick={() => router.push(`/productos?search=${encodeURIComponent(s.nombre)}`)} className="flex justify-between items-center p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors rounded-lg">
                <span className="font-medium text-gray-700">{s.nombre}</span>
                <span className="badge-error">{s.stock_actual} / mín. {s.stock_minimo || s.stock_actual}</span>
              </div>
            )) : <p className="text-gray-500 text-center py-4">Stock en niveles óptimos.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
