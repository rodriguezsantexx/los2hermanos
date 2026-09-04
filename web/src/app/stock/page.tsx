"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  stock_actual: number;
  stock_minimo: number;
  unidad?: string | null;
};

type MovimientoStock = {
  id: string;
  producto_id: string;
  cantidad: number;
  tipo: "Entrada" | "Salida";
  motivo: string;
  fecha: string;
  productos?: {
    nombre?: string;
  } | null;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos";

export default function StockPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "bajo" | "agotado">("todos");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [formData, setFormData] = useState({
    cantidad: "",
    tipo: "Entrada" as "Entrada" | "Salida",
    motivo: "",
  });

  const fetchStockData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [productosRes, movimientosRes] = await Promise.all([
        fetch(API_URL),
        fetch(`${API_URL}/movimientos_stock?limit=12`),
      ]);

      if (!productosRes.ok) throw new Error("Error al cargar productos");
      if (!movimientosRes.ok) throw new Error("Error al cargar movimientos");

      setProductos(await productosRes.json());
      setMovimientos(await movimientosRes.json());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de conexion";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchStockData();
    });
  }, [fetchStockData]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      const matchesQuery = producto.nombre.toLowerCase().includes(query.toLowerCase());
      const matchesFiltro =
        filtro === "todos" ||
        (filtro === "bajo" && producto.stock_actual > 0 && producto.stock_actual <= producto.stock_minimo) ||
        (filtro === "agotado" && producto.stock_actual <= 0);

      return matchesQuery && matchesFiltro;
    });
  }, [productos, query, filtro]);

  const resumen = useMemo(() => {
    const totalUnidades = productos.reduce((acc, producto) => acc + producto.stock_actual, 0);
    const bajoMinimo = productos.filter((producto) => producto.stock_actual <= producto.stock_minimo).length;
    const agotados = productos.filter((producto) => producto.stock_actual <= 0).length;

    return { totalUnidades, bajoMinimo, agotados };
  }, [productos]);

  const handleOpenModal = (producto: Producto, tipo: "Entrada" | "Salida" = "Entrada") => {
    setSelectedProducto(producto);
    setFormData({
      cantidad: "",
      tipo,
      motivo: tipo === "Entrada" ? "Compra" : "Ajuste",
    });
    setIsModalOpen(true);
  };

  const handleAjustarStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProducto) return;

    setIsSubmitting(true);
    try {
      const payload = {
        cantidad: Number.parseInt(formData.cantidad, 10),
        tipo: formData.tipo,
        motivo: formData.motivo.trim(),
      };

      const res = await fetch(`${API_URL}/${selectedProducto.id}/movimiento_stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error al ajustar el stock");
      }

      setIsModalOpen(false);
      await fetchStockData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al ajustar el stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStockStatus = (stock: number, minimo: number) => {
    if (stock <= 0) return { label: "Agotado", className: "badge-error" };
    if (stock <= minimo) return { label: "Bajo", className: "badge-error" };
    if (stock <= minimo + 5) return { label: "Atencion", className: "badge-warning" };
    return { label: "Normal", className: "badge-success" };
  };

  return (
    <main className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full relative pb-24 md:pb-8">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Stock y Alertas</h2>
          <p className="text-muted text-lg mt-1">Control de inventario, alertas de reposición y movimientos.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button onClick={fetchStockData} className="btn-secondary">
            Actualizar
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-muted font-medium">Unidades disponibles</p>
          <p className="text-3xl font-black text-gray-900 mt-2">{resumen.totalUnidades}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted font-medium">Productos bajo minimo</p>
          <p className="text-3xl font-black text-warning mt-2">{resumen.bajoMinimo}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted font-medium">Agotados</p>
          <p className="text-3xl font-black text-error mt-2">{resumen.agotados}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-3 md:items-center justify-between">
            <input
              type="search"
              placeholder="Buscar producto"
              className="w-full md:max-w-sm bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="grid grid-cols-3 bg-gray-100 rounded-lg p-1 text-sm font-bold">
              {(["todos", "bajo", "agotado"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setFiltro(option)}
                  className={`px-3 py-2 rounded-md transition-colors ${
                    filtro === option ? "bg-white text-primary shadow-sm" : "text-gray-500"
                  }`}
                >
                  {option === "todos" ? "Todos" : option === "bajo" ? "⚠️ Bajo Mínimo" : "🚨 Agotados"}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500 font-medium">Cargando inventario...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500 font-bold">{error}</div>
            ) : productosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-gray-500 font-medium">No hay productos para este filtro.</div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-500 text-xs tracking-wider border-b border-gray-100">
                    <th className="p-4 font-bold">PRODUCTO</th>
                    <th className="p-4 font-bold">ACTUAL</th>
                    <th className="p-4 font-bold">MINIMO</th>
                    <th className="p-4 font-bold">ESTADO</th>
                    <th className="p-4 font-bold text-right">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {productosFiltrados.map((producto) => {
                    const status = getStockStatus(producto.stock_actual, producto.stock_minimo);
                    return (
                      <tr key={producto.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-gray-900">{producto.nombre}</p>
                          <p className="text-xs text-muted">{producto.unidad || "unidades"}</p>
                        </td>
                        <td className="p-4 font-black text-lg text-gray-900">{producto.stock_actual}</td>
                        <td className="p-4 text-gray-600 font-medium">{producto.stock_minimo}</td>
                        <td className="p-4">
                          <span className={status.className}>{status.label}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenModal(producto, "Entrada")} className="btn-secondary py-2 px-3 text-sm">
                              Entrada
                            </button>
                            <button onClick={() => handleOpenModal(producto, "Salida")} className="btn-primary py-2 px-3 text-sm">
                              Salida
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="card">
          <h3 className="text-lg font-bold text-gray-900">Ultimos movimientos</h3>
          <div className="mt-4 space-y-3">
            {movimientos.length === 0 ? (
              <p className="text-sm text-muted">Todavia no hay movimientos registrados.</p>
            ) : (
              movimientos.map((movimiento) => (
                <div key={movimiento.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-sm text-gray-900 truncate">
                      {movimiento.productos?.nombre || "Producto"}
                    </p>
                    <span className={movimiento.tipo === "Entrada" ? "badge-success" : "badge-warning"}>
                      {movimiento.tipo === "Entrada" ? "+" : "-"}
                      {movimiento.cantidad}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-1">{movimiento.motivo}</p>
                  <p className="text-xs text-gray-400 mt-2">{new Date(movimiento.fecha).toLocaleString("es-AR")}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>

      {isModalOpen && selectedProducto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xl font-bold text-gray-900">Ajustar stock</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedProducto.nombre} tiene <span className="font-bold text-gray-900">{selectedProducto.stock_actual}</span> unidades.
              </p>
            </div>
            <form onSubmit={handleAjustarStock} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Movimiento</label>
                  <select
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all font-medium"
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value as "Entrada" | "Salida" })}
                  >
                    <option value="Entrada">Entrada</option>
                    <option value="Salida">Salida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    required
                    type="number"
                    min="1"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="10"
                    value={formData.cantidad}
                    onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <input
                  required
                  type="text"
                  maxLength={100}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                  placeholder="Compra, venta mostrador, merma"
                  value={formData.motivo}
                  onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-lg font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 btn-primary">
                  {isSubmitting ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
