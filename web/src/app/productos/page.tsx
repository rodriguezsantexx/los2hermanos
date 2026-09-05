"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getToken, logoutActive } from "@/lib/session";

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  stock_actual: number;
  stock_minimo: number;
  categoria: string;
  marca?: string;
  cantidad?: string;
  precio_retiro: number | null;
};

type Movimiento = { id: string; producto_id: string; cantidad: number; tipo: "Entrada" | "Salida"; motivo: string; fecha: string; productos?: { nombre?: string } | null };

const CATEGORIAS = ["Gas", "Alimento", "Agua", "Leña"];

const CATEGORIA_ICONO: Record<string, string> = {
  Gas: "🔥",
  Alimento: "🍞",
  Agua: "💧",
  Leña: "🪵",
};

const CATEGORIA_COLOR: Record<string, string> = {
  Gas: "bg-orange-100 text-orange-700",
  Alimento: "bg-amber-100 text-amber-700",
  Agua: "bg-sky-100 text-sky-700",
  Leña: "bg-emerald-100 text-emerald-700",
};

function ProductosContent() {
  const searchParams = useSearchParams();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("Todos");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    precio: "",
    precio_retiro: "",
    categoria: "Gas",
    stock_actual: "",
    marca: "",
    cantidad: "",
  });

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [preciosEditados, setPreciosEditados] = useState<Record<string, string>>({});
  const [preciosRetiroEditados, setPreciosRetiroEditados] = useState<Record<string, string>>({});
  const [stockModal, setStockModal] = useState<Producto | null>(null);
  const [stockForm, setStockForm] = useState({ cantidad: "", tipo: "Entrada" as "Entrada" | "Salida", motivo: "Compra" });
  const [renamingProducto, setRenamingProducto] = useState<Producto | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  const fetchProductos = useCallback(async () => {
    try {
      setLoading(true);
      const [res, movRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/movimientos_stock?limit=12`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
      ]);
      if (res.status === 401 || movRes.status === 401) {
        logoutActive();
        if (window.location.pathname !== "/login") window.location.href = "/login";
        return;
      }
      if (!res.ok || !movRes.ok) throw new Error("Error al cargar productos");
      const data = await res.json();
      setMovimientos(await movRes.json());
      setProductos(data);

      const initialPrices: Record<string, string> = {};
      const initialRetiroPrices: Record<string, string> = {};
      data.forEach((p: Producto) => {
        initialPrices[p.id] = p.precio.toString();
        initialRetiroPrices[p.id] = p.precio_retiro ? p.precio_retiro.toString() : "";
      });
      setPreciosEditados(initialPrices);
      setPreciosRetiroEditados(initialRetiroPrices);

      // Auto-abrir modal de stock si venimos desde el Dashboard
      const searchTarget = searchParams.get("search");
      if (searchTarget && data) {
        const targetProduct = data.find((p: Producto) => p.nombre === searchTarget);
        if (targetProduct) {
          setStockModal(targetProduct);
          setStockForm({ cantidad: "", tipo: "Entrada", motivo: "Compra" });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockModal) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/${stockModal.id}/movimiento_stock`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ cantidad: Number(stockForm.cantidad), tipo: stockForm.tipo, motivo: stockForm.motivo.trim() }) });
      if (res.status === 401) { logoutActive(); if (window.location.pathname !== "/login") window.location.href = "/login"; return; }
      if (!res.ok) { const data = await res.json(); throw new Error(data.detail || "Error al ajustar stock"); }
      setStockModal(null);
      setStockForm({ cantidad: "", tipo: "Entrada", motivo: "Compra" });
      fetchProductos();
    } catch (err) { alert(err instanceof Error ? err.message : "Error al ajustar stock"); }
  };

  const handleRename = async (producto: Producto) => {
    const nombre = nombreEditado.trim();
    if (!nombre || !renamingProducto || nombre === renamingProducto.nombre) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/${renamingProducto.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ nombre }) });
    if (res.status === 401) { logoutActive(); if (window.location.pathname !== "/login") window.location.href = "/login"; return; }
    if (!res.ok) { const data = await res.json(); alert(data.detail || "No se pudo cambiar el nombre"); return; }
    setProductos(prev => prev.map(p => p.id === renamingProducto.id ? { ...p, nombre } : p));
    setRenamingProducto(null);
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchProductos();
    });
  }, [fetchProductos]);

  const handleCreateProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        nombre: formData.nombre,
        precio: Number.parseFloat(formData.precio),
        precio_retiro: formData.precio_retiro ? Number.parseFloat(formData.precio_retiro) : undefined,
        categoria: formData.categoria,
        stock_actual: Number.parseInt(formData.stock_actual, 10),
        stock_minimo: 5,
        marca: formData.marca || undefined,
        cantidad: formData.cantidad || undefined,
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) { logoutActive(); if (window.location.pathname !== "/login") window.location.href = "/login"; return; }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error al guardar el producto");
      }

      setFormData({ nombre: "", precio: "", precio_retiro: "", categoria: "Gas", stock_actual: "", marca: "", cantidad: "" });
      setIsModalOpen(false);
      fetchProductos();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar el producto");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePriceChange = (id: string, value: string) => {
    setPreciosEditados(prev => ({ ...prev, [id]: value }));
  };

  const handleUpdatePrice = async (producto: Producto) => {
    const nuevoPrecioStr = preciosEditados[producto.id];
    const nuevoPrecio = Number.parseFloat(nuevoPrecioStr);

    const nuevoPrecioRetiroStr = preciosRetiroEditados[producto.id];
    const nuevoPrecioRetiro = nuevoPrecioRetiroStr ? Number.parseFloat(nuevoPrecioRetiroStr) : null;

    if (isNaN(nuevoPrecio) || nuevoPrecio < 0 || (nuevoPrecioRetiro !== null && nuevoPrecioRetiro < 0)) {
      alert("Por favor ingresa precios válidos");
      return;
    }

    setUpdatingId(producto.id);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/${producto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ precio: nuevoPrecio, precio_retiro: nuevoPrecioRetiro }),
      });

      if (res.status === 401) { logoutActive(); if (window.location.pathname !== "/login") window.location.href = "/login"; return; }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error al actualizar los precios");
      }

      setProductos(prev => prev.map(p => p.id === producto.id ? { ...p, precio: nuevoPrecio, precio_retiro: nuevoPrecioRetiro } : p));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar");
      setPreciosEditados(prev => ({ ...prev, [producto.id]: producto.precio.toString() }));
      setPreciosRetiroEditados(prev => ({ ...prev, [producto.id]: producto.precio_retiro ? producto.precio_retiro.toString() : "" }));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteProducto = async (producto: Producto) => {
    if (!window.confirm(`¿Seguro que querés eliminar "${producto.nombre}"?`)) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/${producto.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { logoutActive(); if (window.location.pathname !== "/login") window.location.href = "/login"; return; }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error al eliminar el producto");
      }
      setProductos(prev => prev.filter(p => p.id !== producto.id));
      setPreciosEditados(prev => {
        const next = { ...prev };
        delete next[producto.id];
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar el producto");
    }
  };

  const productosFiltrados = productos.filter(p => activeTab === "Todos" || p.categoria === activeTab);

  const stockInfo = (p: Producto) => {
    if (p.stock_actual <= 0) return { label: "Agotado", badge: "bg-red-100 text-red-700", bar: "bg-red-500", pct: 0 };
    if (p.stock_actual <= 10) return { label: `${p.stock_actual} un.`, badge: "bg-amber-100 text-amber-700", bar: "bg-amber-400", pct: Math.min(100, (p.stock_actual / 20) * 100) };
    return { label: `${p.stock_actual} un.`, badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", pct: 100 };
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 pb-28 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Catálogo</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Productos y Precios</h2>
          <p className="mt-1 text-muted">Gestioná tu catálogo, precios y stock.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary w-full md:w-auto shadow-primary/30">
          <span className="text-xl">+</span> Nuevo Producto
        </button>
      </header>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Agregar nuevo producto</h3>
            </div>
            <form onSubmit={handleCreateProducto} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del producto</label>
                <input
                  required
                  type="text"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                  placeholder="Ej. Garrafa 10kg"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                >
                  {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca (Opcional)</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="Ej. Coca-Cola"
                    value={formData.marca}
                    onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad (Opcional)</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="Ej. 1.5 L, 500 GR"
                    value={formData.cantidad}
                    onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Envío ($)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="15000"
                    value={formData.precio}
                    onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Retiro ($) - Opcional</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="14000"
                    value={formData.precio_retiro}
                    onChange={(e) => setFormData({ ...formData, precio_retiro: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock inicial</label>
                <input
                  required
                  type="number"
                  min="0"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                  placeholder="50"
                  value={formData.stock_actual}
                  onChange={(e) => setFormData({ ...formData, stock_actual: e.target.value })}
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
                  {isSubmitting ? "Guardando..." : "Guardar producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stockModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleStockSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-xl font-bold">Ajustar stock: {stockModal.nombre}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Tipo
                <select value={stockForm.tipo} onChange={e => setStockForm({ ...stockForm, tipo: e.target.value as "Entrada" | "Salida", motivo: e.target.value === "Entrada" ? "Compra" : "Ajuste" })} className="mt-1 w-full rounded-lg border p-3">
                  <option>Entrada</option><option>Salida</option>
                </select>
              </label>
              <label className="text-sm font-medium">Cantidad
                <input required min="1" type="number" value={stockForm.cantidad} onChange={e => setStockForm({ ...stockForm, cantidad: e.target.value })} className="mt-1 w-full rounded-lg border p-3" />
              </label>
            </div>
            <label className="block text-sm font-medium">Motivo
              <input required value={stockForm.motivo} onChange={e => setStockForm({ ...stockForm, motivo: e.target.value })} className="mt-1 w-full rounded-lg border p-3" />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStockModal(null)} className="flex-1 rounded-lg bg-gray-100 p-3 font-bold">Cancelar</button>
              <button className="btn-primary flex-1">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {renamingProducto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={e => { e.preventDefault(); handleRename(renamingProducto); }} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-xl font-bold">Cambiar nombre</h3>
            <p className="text-sm text-gray-500">Producto actual: {renamingProducto.nombre}</p>
            <input autoFocus required value={nombreEditado} onChange={e => setNombreEditado(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 outline-none focus:border-primary" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setRenamingProducto(null)} className="flex-1 rounded-lg bg-gray-100 p-3 font-bold">Cancelar</button>
              <button className="btn-primary flex-1">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* Chips de categoría */}
      <div className="sticky top-16 z-10 -mx-4 bg-background px-4 py-2 md:-mx-8 md:px-8">
        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {["Todos", ...CATEGORIAS].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                activeTab === tab ? "bg-primary text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
              }`}
            >
              {tab === "Todos" ? "📋 Todos" : `${CATEGORIA_ICONO[tab] || ""} ${tab}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="p-8 text-center text-muted">Cargando catálogo desde el servidor...</p>
      ) : error ? (
        <p className="p-8 text-center font-bold text-red-500">{error}</p>
      ) : productosFiltrados.length === 0 ? (
        <p className="p-8 text-center text-muted">No hay productos en esta categoría todavía. Agregá uno.</p>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productosFiltrados.map((producto) => {
            const stock = stockInfo(producto);
            const sinCambios =
              Number(preciosEditados[producto.id]) === producto.precio &&
              (preciosRetiroEditados[producto.id] || "") === (producto.precio_retiro ? producto.precio_retiro.toString() : "");
            return (
              <article key={producto.id} className="card !p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${CATEGORIA_COLOR[producto.categoria] || "bg-gray-100"}`}>
                      {CATEGORIA_ICONO[producto.categoria] || "📦"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold leading-tight text-gray-900">
                        {producto.nombre}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[producto.marca, producto.cantidad].filter(Boolean).join(" · ") || producto.categoria}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setRenamingProducto(producto); setNombreEditado(producto.nombre); }}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary"
                    title="Cambiar nombre"
                    aria-label={`Cambiar nombre de ${producto.nombre}`}
                  >
                    ✎
                  </button>
                </div>

                {/* Stock */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">Stock</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${stock.badge}`}>{stock.label}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full transition-all ${stock.bar}`} style={{ width: `${stock.pct}%` }} />
                  </div>
                  <button
                    onClick={() => { setStockModal(producto); setStockForm({ cantidad: "", tipo: "Entrada", motivo: "Compra" }); }}
                    className="mt-2 text-xs font-bold text-primary hover:underline"
                  >
                    Ajustar stock
                  </button>
                </div>

                {/* Precios */}
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">Envío $</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-16 pr-3 text-sm outline-none focus:border-primary focus:ring-1 transition-all"
                      value={preciosEditados[producto.id] || ""}
                      onChange={(e) => handlePriceChange(producto.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdatePrice(producto); }}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">Local $</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-16 pr-3 text-sm outline-none focus:border-primary focus:ring-1 transition-all"
                      value={preciosRetiroEditados[producto.id] || ""}
                      onChange={(e) => setPreciosRetiroEditados(prev => ({ ...prev, [producto.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdatePrice(producto); }}
                      placeholder="Igual"
                    />
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleUpdatePrice(producto)}
                    disabled={updatingId === producto.id || sinCambios}
                    className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors disabled:bg-gray-300 disabled:opacity-50 active:scale-95"
                  >
                    {updatingId === producto.id ? "Guardar..." : "Guardar precios"}
                  </button>
                  <button
                    onClick={() => handleDeleteProducto(producto)}
                    className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                  >
                    Borrar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="card">
        <h3 className="mb-4 text-xl font-bold">Últimos movimientos de stock</h3>
        {movimientos.length === 0 ? (
          <p className="text-muted">Todavía no hay movimientos registrados.</p>
        ) : (
          <div className="space-y-2">
            {movimientos.map(m => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm">
                <span className="font-bold text-gray-900">{m.productos?.nombre || "Producto"}</span>
                <span className={m.tipo === "Entrada" ? "text-green-600" : "text-red-600"}>{m.tipo === "Entrada" ? "+" : "-"}{m.cantidad} un.</span>
                <span className="text-gray-500">{m.motivo}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function ProductosPage() {
  return (
    <Suspense fallback={<div className="p-8">Cargando...</div>}>
      <ProductosContent />
    </Suspense>
  );
}