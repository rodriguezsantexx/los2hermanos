"use client";
import { useState, useEffect } from 'react';

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  stock_actual: number;
};

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
    stock_actual: ''
  });

  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/productos');
      if (!res.ok) throw new Error('Error al cargar productos');
      const data = await res.json();
      setProductos(data);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        nombre: formData.nombre,
        precio: parseFloat(formData.precio),
        stock_actual: parseInt(formData.stock_actual),
        stock_minimo: 5
      };
      
      const res = await fetch('http://localhost:8000/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Error al guardar el producto");
      }
      
      setFormData({ nombre: '', precio: '', stock_actual: '' });
      setIsModalOpen(false);
      fetchProductos(); // Recargar la tabla
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Productos</h2>
          <p className="text-muted text-lg mt-1">Gestiona tu catálogo, precios y stock.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary w-full md:w-auto shadow-primary/30"
        >
          <span className="text-xl">+</span> Nuevo Producto
        </button>
      </header>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Agregar Nuevo Producto</h3>
            </div>
            <form onSubmit={handleCreateProducto} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del producto</label>
                <input 
                  required
                  type="text" 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                  placeholder="Ej. Garrafa 10kg"
                  value={formData.nombre}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio ($)</label>
                  <input 
                    required
                    type="number" 
                    min="0"
                    step="0.01"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="15000"
                    value={formData.precio}
                    onChange={e => setFormData({...formData, precio: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Inicial</label>
                  <input 
                    required
                    type="number"
                    min="0"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-1 transition-all"
                    placeholder="50"
                    value={formData.stock_actual}
                    onChange={e => setFormData({...formData, stock_actual: e.target.value})}
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="flex-1 btn-primary"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {loading ? (
             <div className="p-8 text-center text-gray-500 font-medium">Cargando catálogo desde el servidor... ⏳</div>
          ) : error ? (
             <div className="p-8 text-center text-red-500 font-bold">{error}</div>
          ) : productos.length === 0 ? (
             <div className="p-8 text-center text-gray-500 font-medium">No hay productos en la base de datos Supabase aún. ¡Agrega uno!</div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 text-xs tracking-wider border-b border-gray-100">
                  <th className="p-4 font-bold">PRODUCTO</th>
                  <th className="p-4 font-bold">PRECIO</th>
                  <th className="p-4 font-bold">STOCK</th>
                  <th className="p-4 font-bold text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {productos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-gray-900">{p.nombre}</p>
                    </td>
                    <td className="p-4 font-bold text-gray-900">${Number(p.precio).toLocaleString()}</td>
                    <td className="p-4">
                      {p.stock_actual > 10 ? (
                        <span className="badge-success">{p.stock_actual} un.</span>
                      ) : p.stock_actual > 0 ? (
                        <span className="badge-warning">{p.stock_actual} un.</span>
                      ) : (
                        <span className="badge-error">Agotado</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button className="text-primary font-medium hover:underline text-sm mr-4">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
