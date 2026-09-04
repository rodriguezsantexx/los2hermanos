"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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

function ProductosContent() {
  const searchParams = useSearchParams();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("Todos");

  const CATEGORIAS = ["Gas", "Alimento", "Agua", "Leña"];

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
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos"),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/movimientos_stock?limit=12"),
      ]);
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/${stockModal.id}/movimiento_stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cantidad: Number(stockForm.cantidad), tipo: stockForm.tipo, motivo: stockForm.motivo.trim() }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.detail || "Error al ajustar stock"); }
      setStockModal(null);
      setStockForm({ cantidad: "", tipo: "Entrada", motivo: "Compra" });
      fetchProductos();
    } catch (err) { alert(err instanceof Error ? err.message : "Error al ajustar stock"); }
  };

  const handleRename = async (producto: Producto) => {
    const nombre = nombreEditado.trim();
    if (!nombre || !renamingProducto || nombre === renamingProducto.nombre) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos/${renamingProducto.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
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

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio: nuevoPrecio, precio_retiro: nuevoPrecioRetiro }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error al actualizar los precios");
      }

      setProductos(prev => prev.map(p => p.id === producto.id ? { ...p, precio: nuevoPrecio, precio_retiro: nuevoPrecioRetiro } : p));
      
      const row = document.getElementById(`row-${producto.id}`);
      if (row) {
        row.classList.add('bg-green-50');
        setTimeout(() => row.classList.remove('bg-green-50'), 1000);
      }
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
      });
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

  return (
    <main className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Productos y Precios</h2>
          <p className="text-muted text-lg mt-1">Gestiona tu catálogo, precios y stock.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary w-full md:w-auto shadow-primary/30">
          <span className="text-xl">+</span> Nuevo Producto
        </button>
      </header>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Agregar nuevo producto</h3>
            </div>
            <form onSubmit={handleCreateProducto} className="p-6 space-y-4">
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

      {stockModal && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={handleStockSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"><h3 className="text-xl font-bold">Ajustar stock: {stockModal.nombre}</h3><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Tipo<select value={stockForm.tipo} onChange={e => setStockForm({ ...stockForm, tipo: e.target.value as "Entrada" | "Salida", motivo: e.target.value === "Entrada" ? "Compra" : "Ajuste" })} className="mt-1 w-full rounded-lg border p-3"><option>Entrada</option><option>Salida</option></select></label><label className="text-sm font-medium">Cantidad<input required min="1" type="number" value={stockForm.cantidad} onChange={e => setStockForm({ ...stockForm, cantidad: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label></div><label className="block text-sm font-medium">Motivo<input required value={stockForm.motivo} onChange={e => setStockForm({ ...stockForm, motivo: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label><div className="flex gap-3"><button type="button" onClick={() => setStockModal(null)} className="flex-1 rounded-lg bg-gray-100 p-3 font-bold">Cancelar</button><button className="btn-primary flex-1">Guardar</button></div></form></div>}
      {renamingProducto && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={e => { e.preventDefault(); handleRename(renamingProducto); }} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"><h3 className="text-xl font-bold">Cambiar nombre</h3><p className="text-sm text-gray-500">Producto actual: {renamingProducto.nombre}</p><input autoFocus required value={nombreEditado} onChange={e => setNombreEditado(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 outline-none focus:border-primary" /><div className="flex gap-3"><button type="button" onClick={() => setRenamingProducto(null)} className="flex-1 rounded-lg bg-gray-100 p-3 font-bold">Cancelar</button><button className="btn-primary flex-1">Guardar</button></div></form></div>}

      <div className="card p-0 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500 font-medium">Cargando catálogo desde el servidor...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 font-bold">{error}</div>
          ) : productos.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">
              No hay productos en la base de datos Supabase aun. Agrega uno.
            </div>
          ) : (
            <>
              <div className="border-b border-gray-200">
                <nav className="flex space-x-4 px-4 pt-4 overflow-x-auto" aria-label="Tabs">
                  {["Todos", ...CATEGORIAS].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                        activeTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
              </div>
              <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 text-xs tracking-wider border-b border-gray-100">
                  <th className="p-4 font-bold">PRODUCTO</th>
                  <th className="p-4 font-bold">STOCK</th>
                  <th className="p-4 font-bold w-48">PRECIOS</th>
                  <th className="p-4 font-bold text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {productos.filter(p => activeTab === "Todos" || p.categoria === activeTab).map((producto) => (
                  <tr key={producto.id} id={`row-${producto.id}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2"><p className="font-bold text-gray-900">{producto.nombre} {producto.marca ? `(${producto.marca})` : ""} {producto.cantidad ? `- ${producto.cantidad}` : ""}</p><button onClick={() => { setRenamingProducto(producto); setNombreEditado(producto.nombre); }} className="text-gray-400 hover:text-primary" title="Cambiar nombre" aria-label={`Cambiar nombre de ${producto.nombre}`}>✎</button></div>
                    </td>
                    <td className="p-4">
                      {producto.stock_actual > 10 ? (
                        <span className="badge-success">{producto.stock_actual} un.</span>
                      ) : producto.stock_actual > 0 ? (
                        <span className="badge-warning">{producto.stock_actual} un.</span>
                      ) : (
                        <span className="badge-error">Agotado</span>
                      )}
                      <button onClick={() => { setStockModal(producto); setStockForm({ cantidad: "", tipo: "Entrada", motivo: "Compra" }); }} className="mt-2 block text-xs font-bold text-primary hover:underline">Ajustar stock</button>
                    </td>
                    <td className="p-4">
                      <div className="space-y-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-xs">Envío $</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full bg-white border border-gray-200 rounded-lg pl-14 pr-3 py-2 outline-none focus:border-primary focus:ring-1 transition-all text-sm"
                            value={preciosEditados[producto.id] || ""}
                            onChange={(e) => handlePriceChange(producto.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdatePrice(producto);
                            }}
                          />
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-xs">Local $</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full bg-white border border-gray-200 rounded-lg pl-14 pr-3 py-2 outline-none focus:border-primary focus:ring-1 transition-all text-sm"
                            value={preciosRetiroEditados[producto.id] || ""}
                            onChange={(e) => setPreciosRetiroEditados(prev => ({...prev, [producto.id]: e.target.value}))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdatePrice(producto);
                            }}
                            placeholder="Igual"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 flex-col items-end">
                        <button 
                          onClick={() => handleUpdatePrice(producto)}
                          disabled={updatingId === producto.id || (Number(preciosEditados[producto.id]) === producto.precio && (preciosRetiroEditados[producto.id] || "") === (producto.precio_retiro ? producto.precio_retiro.toString() : ""))}
                          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:bg-gray-300 transition-colors shadow-sm w-full max-w-[100px]"
                        >
                          {updatingId === producto.id ? "Guardar..." : "Guardar"}
                        </button>
                        <button
                          onClick={() => handleDeleteProducto(producto)}
                          className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors w-full max-w-[100px]"
                        >
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <section className="card"><h3 className="mb-4 text-xl font-bold">Últimos movimientos de stock</h3>{movimientos.length === 0 ? <p className="text-muted">Todavía no hay movimientos registrados.</p> : <div className="space-y-2">{movimientos.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm"><span className="font-bold text-gray-900">{m.productos?.nombre || "Producto"}</span><span className={m.tipo === "Entrada" ? "text-green-600" : "text-red-600"}>{m.tipo === "Entrada" ? "+" : "-"}{m.cantidad} un.</span><span className="text-gray-500">{m.motivo}</span></div>)}</div>}</section>
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
