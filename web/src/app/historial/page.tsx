"use client";

import React, { useEffect, useState, FormEvent, Fragment } from "react";
import { apiFetch } from "@/lib/api";

type Movimiento = { id: string; tipo: "Ingreso" | "Egreso"; monto: number; metodo_pago: string; descripcion?: string; fecha: string; usuarios?: { nombre: string } };
type CajaResumen = { ingresos: number; egresos: number; saldo: number; movimientos: Movimiento[] };
type ResumenDia = { fecha: string; ingresos: number; egresos: number; saldo: number };
type CajaMensual = { mes: string; ingresos: number; egresos: number; saldo: number; total_movimientos: number; resumen_dias: ResumenDia[] };

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

// Normaliza el método de pago: Transferencia y MercadoPago se cuentan como "Digital"
const normalizarPago = (pago?: string) => {
  if (!pago) return "A confirmar";
  const p = pago.toLowerCase();
  if (p.includes("transferencia") || p.includes("mercado") || p.includes("digital")) return "Digital";
  if (p.includes("efectivo")) return "Efectivo";
  if (p.includes("fiado")) return "Fiado";
  return pago;
};

const infoPago = (pago: string) => {
  switch (pago) {
    case "Efectivo": return { icono: "💵", clase: "bg-emerald-50 text-emerald-700" };
    case "Digital": return { icono: "📲", clase: "bg-blue-50 text-blue-700" };
    case "Fiado": return { icono: "📒", clase: "bg-amber-50 text-amber-700" };
    default: return { icono: "⏳", clase: "bg-gray-50 text-gray-600" };
  }
};

export default function HistorialVentasPage() {
  const [modo, setModo] = useState<"dia" | "mes">("dia");
  const [fechaStr, setFechaStr] = useState(new Date().toISOString().split("T")[0]);
  const [mesStr, setMesStr] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  
  const [caja, setCaja] = useState<CajaResumen>({ ingresos: 0, egresos: 0, saldo: 0, movimientos: [] });
  const [cajaMensual, setCajaMensual] = useState<CajaMensual>({ mes: "", ingresos: 0, egresos: 0, saldo: 0, total_movimientos: 0, resumen_dias: [] });
  
  const [errorCaja, setErrorCaja] = useState("");
  const [form, setForm] = useState({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });

  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedDayMovements, setExpandedDayMovements] = useState<Movimiento[]>([]);

  // Pedidos para el cierre de caja (ventas por método de pago)
  const [pedidos, setPedidos] = useState<ApiPedido[]>([]);

  // Cierre de caja: pedidos ENTREGADOS del día/mes seleccionado, agrupados por método
  const esDelPeriodo = (createdAt?: string) => {
    if (!createdAt) return false;
    const d = new Date(createdAt);
    if (modo === "dia") {
      return d.toISOString().split("T")[0] === fechaStr;
    }
    return d.toISOString().slice(0, 7) === mesStr;
  };
  const entregados = pedidos.filter((p) => p.estado === "Entregado" && esDelPeriodo(p.created_at));
  const totalPorPago = (pago: string) =>
    entregados.filter((p) => normalizarPago(p.metodo_pago) === pago).reduce((sum, p) => sum + Number(p.total || 0), 0);
  const cierre = {
    Efectivo: totalPorPago("Efectivo"),
    Digital: totalPorPago("Digital"),
    Fiado: totalPorPago("Fiado"),
    total: entregados.reduce((sum, p) => sum + Number(p.total || 0), 0),
  };

  // Generar últimos 12 meses para el selector
  const mesesDisponibles = Array.from({length: 12}, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return { 
      value: d.toISOString().slice(0, 7), 
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
    };
  });

  const cargarDatos = async () => {
    try {
      if (modo === "dia") {
        const data = await apiFetch<CajaResumen>(`/api/finanzas/caja/resumen?fecha=${fechaStr}`);
        setCaja(data);
      } else {
        const data = await apiFetch<CajaMensual>(`/api/finanzas/caja/resumen-mensual?mes=${mesStr}`);
        setCajaMensual(data);
      }
      setErrorCaja("");
    } catch (err) {
      setErrorCaja(err instanceof Error ? err.message : "No se pudo cargar la información");
    }
  };

  useEffect(() => { 
    cargarDatos();
  }, [fechaStr, mesStr, modo]);

  useEffect(() => {
    apiFetch<ApiPedido[]>("/api/pedidos")
      .then(setPedidos)
      .catch(() => setPedidos([]));
  }, []);

  const guardarMovimiento = async (event: FormEvent) => {
    event.preventDefault();
    setErrorCaja("");
    try {
      await apiFetch("/api/finanzas/caja/movimientos", { method: "POST", body: JSON.stringify({ ...form, monto: Number(form.monto) }) });
      setForm({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });
      await cargarDatos();
    } catch (err) { setErrorCaja(err instanceof Error ? err.message : "No se pudo registrar el movimiento"); }
  };

  return (
    <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Finanzas</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Historial de Ventas y Caja</h2>
          <p className="mt-1 text-muted">Resumen financiero diario y gestión de movimientos.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button onClick={() => setModo("dia")} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${modo === "dia" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>Por Día</button>
            <button onClick={() => setModo("mes")} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${modo === "mes" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>Por Mes</button>
          </div>
          
          {modo === "dia" ? (
            <input type="date" value={fechaStr} onChange={(e) => setFechaStr(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm outline-none focus:border-primary" />
          ) : (
            <select value={mesStr} onChange={(e) => setMesStr(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm outline-none focus:border-primary capitalize">
              {mesesDisponibles.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Tarjetas de Resumen */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="card !bg-primary !text-white border-none shadow-lg shadow-primary/20">
          <p className="text-blue-200 font-medium text-sm tracking-wider">SALDO TOTAL DEL {modo === "dia" ? "DÍA" : "MES"}</p>
          <p className="text-white text-3xl md:text-4xl font-black mt-2 drop-shadow-sm">${(modo === "dia" ? caja.saldo : cajaMensual.saldo).toLocaleString("es-AR")}</p>
        </div>
        <div className="card">
          <p className="text-muted font-medium text-sm tracking-wider">INGRESOS (CAJA)</p>
          <p className="text-3xl md:text-4xl font-black text-green-600 mt-2">+${(modo === "dia" ? caja.ingresos : cajaMensual.ingresos).toLocaleString("es-AR")}</p>
        </div>
        <div className="card">
          <p className="text-muted font-medium text-sm tracking-wider">EGRESOS (CAJA)</p>
          <p className="text-3xl md:text-4xl font-black text-red-600 mt-2">-${(modo === "dia" ? caja.egresos : cajaMensual.egresos).toLocaleString("es-AR")}</p>
        </div>
      </section>

      {/* Cierre de caja: ventas entregadas por método de pago */}
      <section className="card !p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Cierre de caja</h3>
          <span className="text-xs text-muted">{entregados.length} entregados {modo === "dia" ? "hoy" : "en el mes"}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { pago: "Efectivo", monto: cierre.Efectivo },
            { pago: "Digital", monto: cierre.Digital },
            { pago: "Fiado", monto: cierre.Fiado },
          ].map(({ pago, monto }) => {
            const info = infoPago(pago);
            return (
              <div key={pago} className={`rounded-xl p-3 ${info.clase}`}>
                <p className="text-xs font-bold">{info.icono} {pago}</p>
                <p className="mt-1 text-lg font-black text-gray-900">${monto.toLocaleString("es-AR")}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-900 px-4 py-3">
          <span className="text-sm font-bold text-gray-300">Total ventas entregadas</span>
          <span className="text-xl font-black text-white">${cierre.total.toLocaleString("es-AR")}</span>
        </div>
      </section>

      {/* Sección de Movimientos / Reporte */}
      <section className="space-y-4">
        {errorCaja && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{errorCaja}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <form onSubmit={guardarMovimiento} className="card space-y-4 h-fit sticky top-24">
            <h2 className="text-xl font-bold border-b border-gray-100 pb-2">Registrar movimiento</h2>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3">
              <option>Ingreso</option>
              <option>Egreso</option>
            </select>
            <input required type="number" min="0.01" step="0.01" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3" />
            <select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3">
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Tarjeta</option>
              <option>Otro</option>
            </select>
            <input placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3" />
            <button type="submit" className="btn-primary w-full">Registrar</button>
          </form>

          <div className="md:col-span-2 card overflow-hidden p-0 flex flex-col h-full">
            {modo === "dia" ? (
              <>
                <h2 className="border-b border-gray-100 p-5 text-xl font-bold flex justify-between items-center">
                  Movimientos del {new Date(fechaStr + "T12:00:00").toLocaleDateString('es-AR')}
                  <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-600">{caja.movimientos.length} reg.</span>
                </h2>
                <div className="overflow-x-auto flex-1 bg-white">
                  <table className="w-full min-w-[600px] text-left">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th className="p-4">HORA</th>
                        <th className="p-4">TIPO</th>
                        <th className="p-4">MONTO</th>
                        <th className="p-4">MÉTODO</th>
                        <th className="p-4">DESCRIPCIÓN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {caja.movimientos.map(mov => (
                        <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 text-xs font-medium text-gray-400">
                            {new Date(mov.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4 font-bold">
                            <span className={`px-2 py-1 rounded-md text-xs ${mov.tipo === "Ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {mov.tipo}
                            </span>
                          </td>
                          <td className={`p-4 font-bold ${mov.tipo === "Ingreso" ? "text-green-600" : "text-red-600"}`}>
                            {mov.tipo === "Ingreso" ? "+" : "-"}${Number(mov.monto).toLocaleString("es-AR")}
                          </td>
                          <td className="p-4 text-gray-600 text-sm font-medium">{mov.metodo_pago}</td>
                          <td className="p-4 text-gray-600 text-sm max-w-[200px] truncate" title={mov.descripcion}>{mov.descripcion || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {caja.movimientos.length === 0 && (
                    <div className="p-12 text-center flex flex-col items-center">
                      <span className="text-4xl mb-3">📭</span>
                      <p className="text-gray-400 font-medium">No hay movimientos registrados para este día.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="border-b border-gray-100 p-5 text-xl font-bold flex justify-between items-center">
                  Resumen Diario (Mes: {mesStr})
                  <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-600">{cajaMensual.resumen_dias.length} días operativos</span>
                </h2>
                <div className="overflow-x-auto flex-1 bg-white">
                  <table className="w-full min-w-[500px] text-left">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th className="p-4">FECHA</th>
                        <th className="p-4 text-right">INGRESOS</th>
                        <th className="p-4 text-right">EGRESOS</th>
                        <th className="p-4 text-right">SALDO DÍA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cajaMensual.resumen_dias.map(dia => (
                        <Fragment key={dia.fecha}>
                          <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={async () => { 
                            if (expandedDay === dia.fecha) {
                              setExpandedDay(null);
                            } else {
                              setExpandedDay(dia.fecha);
                              try {
                                const data = await apiFetch<CajaResumen>(`/api/finanzas/caja/resumen?fecha=${dia.fecha}`);
                                setExpandedDayMovements(data.movimientos);
                              } catch { setExpandedDayMovements([]); }
                            }
                          }}>
                            <td className="p-4 font-bold text-gray-700 flex items-center gap-2">
                              <span className={`text-xs transition-transform ${expandedDay === dia.fecha ? "rotate-90" : ""}`}>▶</span>
                              {new Date(dia.fecha + "T12:00:00").toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </td>
                            <td className="p-4 text-right font-bold text-green-600">+${dia.ingresos.toLocaleString("es-AR")}</td>
                            <td className="p-4 text-right font-bold text-red-600">-${dia.egresos.toLocaleString("es-AR")}</td>
                            <td className="p-4 text-right font-black text-gray-900">${dia.saldo.toLocaleString("es-AR")}</td>
                          </tr>
                          {expandedDay === dia.fecha && (
                            <tr>
                              <td colSpan={4} className="p-0 bg-gray-50/80 border-b border-gray-200">
                                <div className="p-4 pl-10 border-l-4 border-primary">
                                  <h4 className="font-bold text-xs mb-3 text-gray-500 uppercase tracking-wider">Movimientos del Día</h4>
                                  {expandedDayMovements.length > 0 ? (
                                    <table className="w-full text-left text-sm bg-white rounded-lg shadow-sm border border-gray-100">
                                      <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                                        <tr><th className="p-3 font-bold">Tipo</th><th className="p-3 font-bold">Monto</th><th className="p-3 font-bold">Método</th><th className="p-3 font-bold">Descripción</th></tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {expandedDayMovements.map(mov => (
                                          <tr key={mov.id}>
                                            <td className="p-3 font-bold">
                                              <span className={`px-2 py-1 rounded-md text-[10px] ${mov.tipo === "Ingreso" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{mov.tipo}</span>
                                            </td>
                                            <td className={`p-3 font-bold ${mov.tipo === "Ingreso" ? "text-green-600" : "text-red-600"}`}>${Number(mov.monto).toLocaleString("es-AR")}</td>
                                            <td className="p-3 text-gray-600">{mov.metodo_pago}</td>
                                            <td className="p-3 text-gray-500">{mov.descripcion || "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="text-sm text-gray-500">No hay movimientos detallados.</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  {cajaMensual.resumen_dias.length === 0 && (
                    <div className="p-12 text-center flex flex-col items-center">
                      <span className="text-4xl mb-3">📅</span>
                      <p className="text-gray-400 font-medium">No hay actividad registrada en este mes.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
