"use client";

import { FormEvent, useEffect, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch } from "@/lib/api";

type Cliente = { id: string; nombre: string; saldo_corriente: number };
type Cuenta = { cliente: Cliente; movimientos: { id: string; monto: number; tipo: string; fecha: string }[] };

function CuentaContent() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Efectivo");
  const [error, setError] = useState("");

  useEffect(() => { apiFetch<Cliente[]>("/api/clientes").then(data => { const list = data.map(item => ({ ...item, saldo_corriente: Number(item.saldo_corriente || 0) })); setClientes(list); if (list[0]) setClienteId(list[0].id); }).catch(err => setError(err.message)); }, []);
  useEffect(() => { if (!clienteId) return; apiFetch<Cuenta>(`/api/finanzas/clientes/${clienteId}/cuenta-corriente`).then(setCuenta).catch(err => setError(err.message)); }, [clienteId]);

  const registrar = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await apiFetch(`/api/finanzas/clientes/${clienteId}/abonos`, { method: "POST", body: JSON.stringify({ monto: Number(monto), metodo_pago: metodo }) }); setMonto(""); const refreshed = await apiFetch<Cuenta>(`/api/finanzas/clientes/${clienteId}/cuenta-corriente`); setCuenta(refreshed); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el abono"); } };

  return <main className="flex-1 space-y-6 p-4 md:p-8"><header><p className="text-sm font-bold uppercase tracking-wider text-primary">Finanzas</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Cuenta corriente</h1><p className="mt-1 text-muted">Consultá deudas y registrá abonos de clientes.</p></header>{error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}<section className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]"><div className="card space-y-3"><h2 className="text-xl font-bold">Clientes</h2>{clientes.map(cliente => <button key={cliente.id} onClick={() => setClienteId(cliente.id)} className={`flex w-full items-center justify-between rounded-xl p-3 text-left ${cliente.id === clienteId ? "bg-blue-50 text-primary" : "bg-gray-50"}`}><span className="font-bold">{cliente.nombre}</span><span className="text-sm">${cliente.saldo_corriente.toLocaleString("es-AR")}</span></button>)}{clientes.length === 0 && <p className="text-sm text-muted">No hay clientes cargados.</p>}</div>{cuenta && <div className="space-y-6"><div className="card flex items-center justify-between"><div><p className="text-sm text-muted">Saldo pendiente</p><p className="mt-1 text-4xl font-black text-gray-900">${Number(cuenta.cliente.saldo_corriente || 0).toLocaleString("es-AR")}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{cuenta.cliente.nombre}</span></div><form onSubmit={registrar} className="card flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-bold">Registrar abono<input required type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3" /></label><select value={metodo} onChange={e => setMetodo(e.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 p-3"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select><button className="btn-primary">Registrar</button></form><section className="card"><h2 className="mb-4 text-xl font-bold">Movimientos</h2><div className="space-y-3">{cuenta.movimientos.map(mov => <div key={mov.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><div><p className="font-bold">{mov.tipo}</p><p className="text-xs text-muted">{new Date(mov.fecha).toLocaleString("es-AR")}</p></div><span className="font-bold">${Number(mov.monto).toLocaleString("es-AR")}</span></div>)}{cuenta.movimientos.length === 0 && <p className="text-muted">Sin movimientos.</p>}</div></section></div>}</section></main>;
}

export default function CuentaCorrientePage() { return <RoleGuard allowedRole="ADMIN"><CuentaContent /></RoleGuard>; }
