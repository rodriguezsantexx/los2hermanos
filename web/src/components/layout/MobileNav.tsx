"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileNav() {
  const pathname = usePathname();
  
  // En móvil mostramos los accesos más rápidos y críticos para el día a día
  const menu = [
    { name: "Inicio", icon: "🏠", path: "/" },
    { name: "Pedidos", icon: "📦", path: "/pedidos" },
    { name: "Stock", icon: "📊", path: "/stock" },
    { name: "Caja", icon: "💰", path: "/caja" },
    { name: "Más", icon: "☰", path: "/menu" } // Redirigirá a una pantalla con el resto (Clientes, Choferes, Config)
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.08)]">
      {menu.map(item => {
        const isActive = pathname === item.path;
        return (
          <Link 
            key={item.name} 
            href={item.path}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-900'}`}
          >
            <span className={`text-2xl ${isActive ? 'scale-110 transition-transform' : ''}`}>{item.icon}</span>
            <span className="text-[10px] font-bold tracking-wide">{item.name}</span>
          </Link>
        )
      })}
    </div>
  );
}
