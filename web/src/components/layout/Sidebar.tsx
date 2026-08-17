import Link from 'next/link';

export default function Sidebar() {
  const menu = [
    { name: "Inicio", icon: "🏠", path: "/" },
    { name: "Pedidos", icon: "📦", path: "/pedidos" },
    { name: "Productos", icon: "🛒", path: "/productos" },
    { name: "Stock", icon: "📊", path: "/stock" },
    { name: "Clientes", icon: "👥", path: "/clientes" },
    { name: "Caja", icon: "💰", path: "/caja" },
    { name: "Choferes", icon: "🚚", path: "/choferes" },
    { name: "Configuración", icon: "⚙️", path: "/configuracion" }
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 h-screen sticky top-0 shadow-sm z-10">
      <div className="p-6">
        <h1 className="text-2xl font-black text-primary">Los 2 Hermanos</h1>
        <p className="text-xs text-muted mt-1 uppercase tracking-wider font-bold">Admin Panel</p>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
        {menu.map(item => (
          <Link 
            key={item.name} 
            href={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${item.name === 'Inicio' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-gray-600 hover:bg-gray-50 hover:text-primary font-medium'}`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-gray-900 font-bold shadow-sm">
            AD
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">Administrador</p>
            <p className="text-xs text-muted">admin@sistema</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
