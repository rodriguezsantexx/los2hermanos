"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import LogoutButton from '@/components/auth/LogoutButton';

export default function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [userHomePath, setUserHomePath] = useState("/dashboard");
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("los2hermanos_user") || "null");
      const role = user?.roles?.nombre;
      setIsAdmin(role === "ADMIN");
      setUserHomePath(role === "CHOFER_HUERTA_GRANDE" ? "/chofer/huerta-grande" : role === "CHOFER_LA_FALDA" ? "/chofer/la-falda" : "/dashboard");
    } catch { setIsAdmin(false); setUserHomePath("/login"); }
    setMounted(true);
  }, []);
  if (!mounted || pathname === "/login") return null;
  const isDriverRoute = pathname.startsWith("/chofer/");
  const showAdminMenu = !isDriverRoute && isAdmin;
  const homePath = isDriverRoute ? (pathname.includes("huerta-grande") ? "/chofer/huerta-grande" : "/chofer/la-falda") : userHomePath;
  const pedidosPath = isDriverRoute ? `${homePath}/pedidos` : "/pedidos";
  const menu = [
    { name: "Inicio", icon: "🏠", path: homePath },
    { name: "Pedidos", icon: "📦", path: pedidosPath },
    ...(showAdminMenu ? [{ name: "Productos", icon: "🛒", path: "/productos" }, { name: "Clientes", icon: "👥", path: "/clientes" }, { name: "Caja", icon: "💰", path: "/caja" }, { name: "Cuenta corriente", icon: "📒", path: "/cuenta-corriente" }, { name: "Métricas", icon: "📊", path: "/metricas" }, { name: "Choferes", icon: "🚚", path: "/choferes" }, { name: "Configuración", icon: "⚙️", path: "/configuracion" }] : [])
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
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${pathname === item.path ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-gray-600 hover:bg-gray-50 hover:text-primary font-medium'}`}
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
        <LogoutButton />
      </div>
    </aside>
  );
}
