"use client";

import { useEffect, useState, FormEvent } from "react";
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
  cuenta_corriente_total: number;
};
type CajaResumen = { ingresos: number; egresos: number; saldo: number; movimientos: Movimiento[] };

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [pedidosRecientes, setPedidosRecientes] = useState<any[]>([]);
  const [caja, setCaja] = useState<CajaResumen>({ ingresos: 0, egresos: 0, saldo: 0, movimientos: [] });
  const [form, setForm] = useState({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });
  const [errorCaja, setErrorCaja] = useState("");

  const cargarCaja = async () => {
    try { setCaja(await apiFetch<CajaResumen>("/api/finanzas/caja/resumen")); } 
    catch (err) { setErrorCaja(err instanceof Error ? err.message : "No se pudo cargar la caja"); }
  };

  const cargarDatos = async () => {
    apiFetch<DashboardMetrics>("/api/finanzas/metricas/resumen").then(setMetrics).catch(() => undefined);
    apiFetch<any[]>("/api/pedidos").then(data => setPedidosRecientes((data || []).slice(0, 5))).catch(() => undefined);
    cargarCaja();
  };

  useEffect(() => { 
    cargarDatos();
  }, []);

  const guardarMovimiento = async (event: FormEvent) => {
    event.preventDefault();
    setErrorCaja("");
    try {
      await apiFetch("/api/finanzas/caja/movimientos", { method: "POST", body: JSON.stringify({ ...form, monto: Number(form.monto) }) });
      setForm({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });
      await cargarDatos(); // Reload metrics and caja
    } catch (err) { setErrorCaja(err instanceof Error ? err.message : "No se pudo registrar el movimiento"); }
  };

  const pedidos = metrics?.pedidos_total ?? 0;
  const entregados = metrics?.pedidos_por_estado?.Entregado ?? 0;
  const pendientes = (metrics?.pedidos_por_estado?.Pendiente ?? 0) + (metrics?.pedidos_por_estado?.Asignado ?? 0) + (metrics?.pedidos_por_estado?.["En reparto"] ?? 0);

  return (
    <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Hola 👋, Admin</h2>
          <p className="text-muted text-lg mt-1">Resumen general y control de caja.</p>
        </div>
        <button className="btn-primary w-full md:w-auto shadow-primary/30"><span className="text-xl">+</span> Nuevo Pedido</button>
      </header>

      {/* Tarjetas de Resumen (Métricas Clave) */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="card !bg-primary !text-white border-none shadow-lg shadow-primary/20"><p className="text-blue-200 font-medium text-sm tracking-wider">VENTAS</p><p className="text-white text-3xl md:text-4xl font-black mt-2 drop-shadow-sm">${(metrics?.ventas_total ?? 0).toLocaleString("es-AR")}</p></div>
        <div className="card"><p className="text-muted font-medium text-sm tracking-wider">PEDIDOS</p><p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">{pedidos}</p></div>
        <div className="card"><p className="text-muted font-medium text-sm tracking-wider">SALDO CAJA</p><p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">${(metrics?.saldo_caja ?? 0).toLocaleString("es-AR")}</p></div>
        <div className="card"><p className="text-muted font-medium text-sm tracking-wider">CTA. CTE.</p><p className="text-3xl md:text-4xl font-black text-gray-900 mt-2">${(metrics?.cuenta_corriente_total ?? 0).toLocaleString("es-AR")}</p></div>
      </section>

      {/* Sección de Caja (Ingresos y Egresos) */}
      <section className="space-y-4">
        <h3 className="text-2xl font-bold text-gray-900">Caja Diaria</h3>
        {errorCaja && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{errorCaja}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <form onSubmit={guardarMovimiento} className="card space-y-4">
            <h2 className="text-xl font-bold">Nuevo movimiento</h2>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3"><option>Ingreso</option><option>Egreso</option></select>
            <input required type="number" min="0.01" step="0.01" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3" />
            <select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select>
            <input placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3" />
            <button type="submit" className="btn-primary w-full">Registrar movimiento</button>
          </form>

          <div className="md:col-span-2 card overflow-hidden p-0 flex flex-col h-full">
            <h2 className="border-b border-gray-100 p-5 text-xl font-bold">Movimientos de hoy</h2>
            <div className="overflow-x-auto flex-1">
              <table className="w-full min-w-[500px] text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="p-4">TIPO</th>
                    <th className="p-4">MONTO</th>
                    <th className="p-4">MÉTODO</th>
                    <th className="p-4">DESCRIPCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {caja.movimientos.map(mov => (
                    <tr key={mov.id}>
                      <td className="p-4 font-bold">{mov.tipo}</td>
                      <td className={`p-4 font-bold ${mov.tipo === "Ingreso" ? "text-green-600" : "text-red-600"}`}>${Number(mov.monto).toLocaleString("es-AR")}</td>
                      <td className="p-4 text-gray-600">{mov.metodo_pago}</td>
                      <td className="p-4 text-gray-600">{mov.descripcion || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {caja.movimientos.length === 0 && <p className="p-8 text-center text-muted">No hay movimientos registrados hoy.</p>}
            </div>
          </div>
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
                <span className="badge-error">{s.stock_actual} / mín. {s.stock_minimo || s.stock_actual}</span>
              </div>
            )) : <p className="text-gray-500 text-center py-4">Stock en niveles óptimos.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
