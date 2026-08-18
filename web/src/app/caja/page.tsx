"use client";

import { FormEvent, useEffect, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch } from "@/lib/api";

type Movimiento = { id: string; tipo: "Ingreso" | "Egreso"; monto: number; metodo_pago: string; descripcion?: string; fecha: string };
type CajaResumen = { ingresos: number; egresos: number; saldo: number; movimientos: Movimiento[] };

function CajaContent() {
  const [resumen, setResumen] = useState<CajaResumen>({ ingresos: 0, egresos: 0, saldo: 0, movimientos: [] });
  const [form, setForm] = useState({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });
  const [error, setError] = useState("");

  const cargar = async () => {
    try { setResumen(await apiFetch<CajaResumen>("/api/finanzas/caja/resumen")); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar la caja"); }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await apiFetch("/api/finanzas/caja/movimientos", { method: "POST", body: JSON.stringify({ ...form, monto: Number(form.monto) }) });
      setForm({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });
      await cargar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el movimiento"); }
  };

  return <main className="flex-1 space-y-6 p-4 md:p-8"><header><p className="text-sm font-bold uppercase tracking-wider text-primary">Finanzas</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Caja</h1><p className="mt-1 text-muted">Control de ingresos y egresos del día.</p></header>
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="card"><p className="text-sm text-muted">Ingresos</p><p className="mt-2 text-3xl font-black text-green-600">${resumen.ingresos.toLocaleString("es-AR")}</p></div><div className="card"><p className="text-sm text-muted">Egresos</p><p className="mt-2 text-3xl font-black text-red-600">${resumen.egresos.toLocaleString("es-AR")}</p></div><div className="card"><p className="text-sm text-muted">Saldo</p><p className="mt-2 text-3xl font-black text-gray-900">${resumen.saldo.toLocaleString("es-AR")}</p></div></section>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}
    <section className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]"><form onSubmit={guardar} className="card space-y-4"><h2 className="text-xl font-bold">Nuevo movimiento</h2><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3"><option>Ingreso</option><option>Egreso</option></select><input required type="number" min="0.01" step="0.01" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3" /><select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select><input placeholder="Descripción" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3" /><button className="btn-primary w-full">Registrar movimiento</button></form>
      <section className="card overflow-hidden p-0"><h2 className="border-b border-gray-100 p-5 text-xl font-bold">Movimientos de hoy</h2><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="p-4">TIPO</th><th className="p-4">MONTO</th><th className="p-4">MÉTODO</th><th className="p-4">DESCRIPCIÓN</th></tr></thead><tbody className="divide-y divide-gray-100">{resumen.movimientos.map(mov => <tr key={mov.id}><td className="p-4 font-bold">{mov.tipo}</td><td className={`p-4 font-bold ${mov.tipo === "Ingreso" ? "text-green-600" : "text-red-600"}`}>${Number(mov.monto).toLocaleString("es-AR")}</td><td className="p-4 text-gray-600">{mov.metodo_pago}</td><td className="p-4 text-gray-600">{mov.descripcion || "—"}</td></tr>)}</tbody></table></div>{resumen.movimientos.length === 0 && <p className="p-8 text-center text-muted">No hay movimientos registrados hoy.</p>}</section></section>
  </main>;
}

export default function CajaPage() { return <RoleGuard allowedRole="ADMIN"><CajaContent /></RoleGuard>; }
