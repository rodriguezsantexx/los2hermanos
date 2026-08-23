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

  const registrar = async (event: FormEvent) => { 
    event.preventDefault(); 
    setError(""); 
    try { 
      await apiFetch(`/api/finanzas/clientes/${clienteId}/abonos`, { method: "POST", body: JSON.stringify({ monto: Number(monto), metodo_pago: metodo }) }); 
      setMonto(""); 
      
      // Refrescar los detalles de la cuenta (lado derecho)
      const refreshed = await apiFetch<Cuenta>(`/api/finanzas/clientes/${clienteId}/cuenta-corriente`); 
      setCuenta(refreshed); 
      
      // Refrescar la lista global de clientes (lado izquierdo y el total de arriba)
      const listData = await apiFetch<Cliente[]>("/api/clientes");
      setClientes(listData.map(item => ({ ...item, saldo_corriente: Number(item.saldo_corriente || 0) })));
      
    } catch (err) { 
      setError(err instanceof Error ? err.message : "No se pudo registrar el abono"); 
    } 
  };

  const totalGeneral = clientes.reduce((acc, c) => acc + (c.saldo_corriente || 0), 0);

  return (
    <main className="flex-1 space-y-6 p-4 md:p-8">
      <header className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Finanzas</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Cuenta corriente</h1>
          <p className="mt-1 text-muted">Consultá deudas y registrá abonos de clientes.</p>
        </div>
        <div className="bg-gray-900 text-white p-4 rounded-2xl shadow-lg md:text-right md:min-w-[200px]">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total a cobrar</p>
          <p className="text-3xl font-black mt-1">${totalGeneral.toLocaleString("es-AR")}</p>
        </div>
      </header>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
        <div className="card space-y-3">
          <h2 className="text-xl font-bold">Clientes con Saldo</h2>
          <div className="overflow-y-auto max-h-[500px] space-y-2 pr-2">
            {clientes.map(cliente => (
              <button 
                key={cliente.id} 
                onClick={() => setClienteId(cliente.id)} 
                className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition-colors border ${cliente.id === clienteId ? "bg-blue-50 border-primary text-primary" : "bg-gray-50 border-transparent hover:border-gray-200"}`}
              >
                <span className="font-bold truncate pr-2">{cliente.nombre}</span>
                <span className={`text-sm font-black ${cliente.saldo_corriente > 0 ? 'text-red-600' : 'text-gray-900'}`}>${cliente.saldo_corriente.toLocaleString("es-AR")}</span>
              </button>
            ))}
            {clientes.length === 0 && <p className="text-sm text-muted">No hay clientes con saldo pendiente.</p>}
          </div>
        </div>
        {cuenta && (
          <div className="space-y-6">
            <div className="card flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-error">
              <div>
                <p className="text-sm text-muted font-bold uppercase tracking-wider">Saldo pendiente</p>
                <p className="mt-1 text-5xl font-black text-gray-900">${Number(cuenta.cliente.saldo_corriente || 0).toLocaleString("es-AR")}</p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 uppercase tracking-widest">{cuenta.cliente.nombre}</span>
              </div>
            </div>
            <form onSubmit={registrar} className="card flex flex-col gap-3 sm:flex-row sm:items-end bg-gray-50/50">
              <label className="flex-1 text-sm font-bold text-gray-700">Registrar abono
                <input required type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-sm p-3 focus:border-primary outline-none transition-colors" placeholder="0.00" />
              </label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 font-bold text-gray-700 focus:border-primary outline-none transition-colors">
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Tarjeta</option>
              </select>
              <button type="submit" className="btn-primary shadow-primary/30">Abonar</button>
            </form>
            <section className="card">
              <h2 className="mb-4 text-xl font-bold border-b border-gray-100 pb-3">Historial de Movimientos</h2>
              <div className="space-y-3">
                {cuenta.movimientos.map(mov => (
                  <div key={mov.id} className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 p-4 transition-colors hover:bg-gray-100">
                    <div>
                      <p className="font-bold text-gray-900 flex items-center gap-2">
                        {mov.tipo}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${mov.tipo === 'Abono' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {mov.tipo === 'Abono' ? 'Pago' : 'Deuda'}
                        </span>
                      </p>
                      <p className="text-xs text-muted mt-1">{new Date(mov.fecha).toLocaleString("es-AR", { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                    <span className={`font-black text-lg ${mov.tipo === 'Abono' ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.tipo === 'Abono' ? '+' : '-'}${Number(mov.monto).toLocaleString("es-AR")}
                    </span>
                  </div>
                ))}
                {cuenta.movimientos.length === 0 && <div className="p-8 text-center"><span className="text-3xl mb-2 block">📭</span><p className="text-muted font-medium">Sin movimientos registrados.</p></div>}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default function CuentaCorrientePage() { return <RoleGuard allowedRole="ADMIN"><CuentaContent /></RoleGuard>; }
