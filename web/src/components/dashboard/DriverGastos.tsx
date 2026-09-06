"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Gasto = { id: string; monto: number; metodo_pago: string; descripcion?: string; fecha: string };

const CATEGORIAS = ["Nafta", "Comida", "Peaje", "Otro"];

const esHoy = (iso?: string) => {
  if (!iso) return false;
  const fecha = new Date(iso);
  const hoy = new Date();
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
};

export default function DriverGastos({ localidad }: { localidad: string }) {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState("Nafta");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const data = await apiFetch<Gasto[]>("/api/finanzas/caja/gastos");
      setGastos(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus gastos");
    }
  };

  useEffect(() => { cargar(); }, []);

  const registrar = async (event: FormEvent) => {
    event.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await apiFetch("/api/finanzas/caja/gastos", {
        method: "POST",
        body: JSON.stringify({ monto: Number(monto), categoria, descripcion: descripcion || null }),
      });
      setMonto("");
      setDescripcion("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el gasto");
    }
    setGuardando(false);
  };

  const gastosHoy = gastos.filter((g) => esHoy(g.fecha));
  const totalHoy = gastosHoy.reduce((sum, g) => sum + Number(g.monto || 0), 0);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 pb-24 md:p-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Gastos</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Mis gastos</h1>
        <p className="mt-1 text-muted">Registrá tus gastos del día en {localidad}. Se descuentan de la caja.</p>
      </header>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}

      {/* Total gastado hoy */}
      <section className="card !p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Gastado hoy</p>
          <p className="mt-1 text-3xl font-black text-red-600">-${totalHoy.toLocaleString("es-AR")}</p>
        </div>
        <span className="text-3xl">⛽</span>
      </section>

      {/* Formulario */}
      <form onSubmit={registrar} className="card space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Registrar gasto</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold text-gray-700">
            Monto
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3"
            />
          </label>
          <label className="block text-sm font-bold text-gray-700">
            Categoría
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3"
            >
              {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-bold text-gray-700">
          Descripción (opcional)
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: tanque lleno, almuerzo..."
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3"
          />
        </label>
        <button type="submit" disabled={guardando} className="btn-primary w-full disabled:opacity-50 shadow-primary/30">
          {guardando ? "Guardando..." : "Registrar gasto"}
        </button>
      </form>

      {/* Lista de gastos */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">Gastos recientes</h2>
        {gastos.length === 0 ? (
          <div className="card !p-6 text-center">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-bold text-gray-900">Sin gastos registrados</p>
            <p className="mt-1 text-sm text-muted">Tus gastos van a aparecer acá.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {gastos.map((g) => (
              <article key={g.id} className="card !p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-gray-900">{g.descripcion || "Gasto"}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(g.fecha).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <span className="font-black text-red-600">-${Number(g.monto).toLocaleString("es-AR")}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}