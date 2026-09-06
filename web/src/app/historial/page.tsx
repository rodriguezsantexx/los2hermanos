"use client";

import React, { useEffect, useState, FormEvent } from "react";
import { apiFetch } from "@/lib/api";

type Movimiento = { id: string; tipo: "Ingreso" | "Egreso"; monto: number; metodo_pago: string; descripcion?: string; fecha: string; usuarios?: { nombre: string } };
type CajaResumen = { ingresos: number; egresos: number; saldo: number; movimientos: Movimiento[] };
type ResumenDia = { fecha: string; ingresos: number; egresos: number; saldo: number };
type CajaMensual = { mes: string; ingresos: number; egresos: number; saldo: number; total_movimientos: number; resumen_dias: ResumenDia[] };
type CierreCaja = { id: string; fecha: string; efectivo_esperado: number; efectivo_contado: number; diferencia: number; observaciones?: string; usuarios?: { nombre: string } };
type CierreInfo = { fecha: string; efectivo_esperado: number; cierre: CierreCaja | null };

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
  return pago;
};

const infoPago = (pago: string) => {
  switch (pago) {
    case "Efectivo": return { icono: "💵", clase: "bg-emerald-50 text-emerald-700" };
    case "Digital": return { icono: "📲", clase: "bg-blue-50 text-blue-700" };
    default: return { icono: "⏳", clase: "bg-gray-50 text-gray-600" };
  }
};

// Zona horaria del negocio (Argentina). El "día" va de 00:00 a 00:00 hora local.
const ZONA_ARG = "America/Argentina/Buenos_Aires";
const aFechaLocal = (iso?: string) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_ARG, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
};
const aMesLocal = (iso?: string) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_ARG, year: "numeric", month: "2-digit" }).format(new Date(iso));
};

export default function HistorialVentasPage() {
  const [modo, setModo] = useState<"dia" | "mes">("dia");
  const [fechaStr, setFechaStr] = useState(() => aFechaLocal(new Date().toISOString()));
  const [mesStr, setMesStr] = useState(() => aMesLocal(new Date().toISOString())); // YYYY-MM
  
  const [caja, setCaja] = useState<CajaResumen>({ ingresos: 0, egresos: 0, saldo: 0, movimientos: [] });
  const [cajaMensual, setCajaMensual] = useState<CajaMensual>({ mes: "", ingresos: 0, egresos: 0, saldo: 0, total_movimientos: 0, resumen_dias: [] });
  
  const [errorCaja, setErrorCaja] = useState("");
  const [form, setForm] = useState({ tipo: "Ingreso", monto: "", metodo_pago: "Efectivo", descripcion: "" });

  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedDayMovements, setExpandedDayMovements] = useState<Movimiento[]>([]);

  // Cierre de caja: verificación del efectivo físico
  const [cierreInfo, setCierreInfo] = useState<CierreInfo | null>(null);
  const [modalCierre, setModalCierre] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardandoCierre, setGuardandoCierre] = useState(false);

  // Pedidos para el cierre de caja (ventas por método de pago)
  const [pedidos, setPedidos] = useState<ApiPedido[]>([]);

  // Cierre de caja: pedidos ENTREGADOS del día/mes seleccionado, agrupados por método
  const esDelPeriodo = (createdAt?: string) => {
    if (!createdAt) return false;
    if (modo === "dia") {
      return aFechaLocal(createdAt) === fechaStr;
    }
    return aMesLocal(createdAt) === mesStr;
  };
  const entregados = pedidos.filter((p) => p.estado === "Entregado" && esDelPeriodo(p.created_at));
  const totalPorPago = (pago: string) =>
    entregados.filter((p) => normalizarPago(p.metodo_pago) === pago).reduce((sum, p) => sum + Number(p.total || 0), 0);
  const cierre = {
    Efectivo: totalPorPago("Efectivo"),
    Digital: totalPorPago("Digital"),
    total: entregados.reduce((sum, p) => sum + Number(p.total || 0), 0),
  };

  // Generar últimos 12 meses para el selector (en hora argentina)
  const hoyArg = new Date();
  const anioArg = Number(new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_ARG, year: "numeric" }).format(hoyArg));
  const mesArg = Number(new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_ARG, month: "2-digit" }).format(hoyArg));
  const mesesDisponibles = Array.from({length: 12}, (_, i) => {
    const total = anioArg * 12 + (mesArg - 1) - i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const value = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    return { value, label };
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

  const cargarCierre = async () => {
    if (modo !== "dia") { setCierreInfo(null); return; }
    try {
      const data = await apiFetch<CierreInfo>(`/api/finanzas/caja/cierre?fecha=${fechaStr}`);
      setCierreInfo(data);
    } catch { setCierreInfo(null); }
  };

  useEffect(() => { cargarCierre(); }, [fechaStr, modo]);

  const guardarCierre = async (event: FormEvent) => {
    event.preventDefault();
    setGuardandoCierre(true);
    setErrorCaja("");
    try {
      const data = await apiFetch<CierreCaja>("/api/finanzas/caja/cierre", { method: "POST", body: JSON.stringify({ fecha: fechaStr, efectivo_contado: Number(efectivoContado), observaciones: observaciones || null }) });
      setCierreInfo({ fecha: fechaStr, efectivo_esperado: data.efectivo_esperado, cierre: data });
      setModalCierre(false);
      setEfectivoContado("");
      setObservaciones("");
    } catch (err) { setErrorCaja(err instanceof Error ? err.message : "No se pudo guardar el cierre"); }
    setGuardandoCierre(false);
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { pago: "Efectivo", monto: cierre.Efectivo },
            { pago: "Digital", monto: cierre.Digital },
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

        {modo === "dia" && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">💰 Efectivo a contar</p>
                <p className="mt-1 text-2xl font-black text-gray-900">${(cierreInfo?.efectivo_esperado ?? 0).toLocaleString("es-AR")}</p>
                <p className="text-xs text-emerald-700/70 mt-0.5">Ingresos en efectivo − gastos en efectivo del día</p>
              </div>
              {cierreInfo?.cierre ? (
                <div className="text-right">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${cierreInfo.cierre.diferencia === 0 ? "bg-green-600 text-white" : cierreInfo.cierre.diferencia > 0 ? "bg-amber-500 text-white" : "bg-red-500 text-white"}`}>
                    {cierreInfo.cierre.diferencia === 0 ? "✅ Caja cerrada" : cierreInfo.cierre.diferencia > 0 ? `Sobran $${cierreInfo.cierre.diferencia.toLocaleString("es-AR")}` : `Faltan $${Math.abs(cierreInfo.cierre.diferencia).toLocaleString("es-AR")}`}
                  </span>
                  <p className="text-xs text-muted mt-1">Contado: ${cierreInfo.cierre.efectivo_contado.toLocaleString("es-AR")}</p>
                  <button onClick={() => setModalCierre(true)} className="mt-2 text-xs font-bold text-primary underline">Reabrir cierre</button>
                </div>
              ) : (
                <button onClick={() => setModalCierre(true)} className="btn-primary shadow-primary/30">Cerrar caja</button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Sección de Movimientos / Reporte */}
      <section className="space-y-4">
        {errorCaja && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{errorCaja}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <form onSubmit={guardarMovimiento} className="card space-y-4 h-fit">
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

          <div className="md:col-span-2 card !p-4 flex flex-col h-full">
            {modo === "dia" ? (
              <>
                <h2 className="mb-3 text-xl font-bold flex justify-between items-center">
                  Movimientos del {new Date(fechaStr + "T12:00:00").toLocaleDateString('es-AR')}
                  <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-600">{caja.movimientos.length} reg.</span>
                </h2>
                <div className="space-y-3">
                  {caja.movimientos.map(mov => (
                    <article key={mov.id} className="card !p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${mov.tipo === "Ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {mov.tipo}
                          </span>
                          <span className="text-xs font-medium text-gray-400">
                            {new Date(mov.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-gray-600" title={mov.descripcion}>{mov.descripcion || "—"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`text-lg font-black ${mov.tipo === "Ingreso" ? "text-green-600" : "text-red-600"}`}>
                          {mov.tipo === "Ingreso" ? "+" : "-"}${Number(mov.monto).toLocaleString("es-AR")}
                        </span>
                        <span className="text-xs font-medium text-muted">{mov.metodo_pago}</span>
                      </div>
                    </article>
                  ))}
                  {caja.movimientos.length === 0 && (
                    <div className="card !p-12 text-center flex flex-col items-center">
                      <span className="text-4xl mb-3">📭</span>
                      <p className="text-gray-400 font-medium">No hay movimientos registrados para este día.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-3 text-xl font-bold flex justify-between items-center">
                  Resumen Diario (Mes: {mesStr})
                  <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-600">{cajaMensual.resumen_dias.length} días operativos</span>
                </h2>
                <div className="space-y-3">
                  {cajaMensual.resumen_dias.map(dia => {
                    const abierto = expandedDay === dia.fecha;
                    return (
                      <article key={dia.fecha} className={`card !p-4 transition-colors ${abierto ? "ring-2 ring-primary/60" : ""}`}>
                        <button
                          onClick={async () => {
                            if (abierto) {
                              setExpandedDay(null);
                            } else {
                              setExpandedDay(dia.fecha);
                              try {
                                const data = await apiFetch<CajaResumen>(`/api/finanzas/caja/resumen?fecha=${dia.fecha}`);
                                setExpandedDayMovements(data.movimientos);
                              } catch { setExpandedDayMovements([]); }
                            }
                          }}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <p className="font-bold text-gray-900">
                            {new Date(dia.fecha + "T12:00:00").toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </p>
                          <span className={`text-xs transition-transform ${abierto ? "rotate-90" : ""}`}>▶</span>
                        </button>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-green-50 p-2 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-green-600">Ingresos</p>
                            <p className="mt-0.5 text-sm font-black text-green-700">+${dia.ingresos.toLocaleString("es-AR")}</p>
                          </div>
                          <div className="rounded-xl bg-red-50 p-2 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Egresos</p>
                            <p className="mt-0.5 text-sm font-black text-red-700">-${dia.egresos.toLocaleString("es-AR")}</p>
                          </div>
                          <div className="rounded-xl bg-gray-900 p-2 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Saldo</p>
                            <p className="mt-0.5 text-sm font-black text-white">${dia.saldo.toLocaleString("es-AR")}</p>
                          </div>
                        </div>
                        {abierto && (
                          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                            <h4 className="font-bold text-xs mb-2 text-gray-500 uppercase tracking-wider">Movimientos del Día</h4>
                            {expandedDayMovements.length > 0 ? (
                              expandedDayMovements.map(mov => (
                                <div key={mov.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${mov.tipo === "Ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{mov.tipo}</span>
                                      <span className="text-xs text-gray-500">{mov.metodo_pago}</span>
                                    </div>
                                    <p className="mt-1 truncate text-sm text-gray-600">{mov.descripcion || "—"}</p>
                                  </div>
                                  <span className={`shrink-0 font-bold ${mov.tipo === "Ingreso" ? "text-green-600" : "text-red-600"}`}>
                                    {mov.tipo === "Ingreso" ? "+" : "-"}${Number(mov.monto).toLocaleString("es-AR")}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500">No hay movimientos detallados.</p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {cajaMensual.resumen_dias.length === 0 && (
                    <div className="card !p-12 text-center flex flex-col items-center">
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

      {modalCierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={guardarCierre} className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Cerrar caja</h3>
              <button type="button" onClick={() => setModalCierre(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
            </div>
            <p className="text-sm text-muted">Cierre del {new Date(fechaStr + "T12:00:00").toLocaleDateString('es-AR')}</p>
            <div className="rounded-xl bg-emerald-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Efectivo esperado</p>
              <p className="text-3xl font-black text-gray-900">${(cierreInfo?.efectivo_esperado ?? 0).toLocaleString("es-AR")}</p>
            </div>
            <label className="block text-sm font-bold text-gray-700">
              Efectivo contado
              <input required type="number" min="0" step="0.01" placeholder="0.00" value={efectivoContado} onChange={e => setEfectivoContado(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3" autoFocus />
            </label>
            <label className="block text-sm font-bold text-gray-700">
              Observaciones (opcional)
              <input value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej: faltó vuelto, sobró de un pago..." className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3" />
            </label>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalCierre(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600">Cancelar</button>
              <button type="submit" disabled={guardandoCierre} className="btn-primary flex-1 disabled:opacity-50 shadow-primary/30">{guardandoCierre ? "Guardando..." : "Confirmar cierre"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
