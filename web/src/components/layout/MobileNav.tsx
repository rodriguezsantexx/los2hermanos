"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useNotifications } from '@/context/NotificationContext';

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { totalUnread } = useNotifications();
  const [mounted, setMounted] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
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
  }, [pathname]);

  if (!mounted || pathname === "/login") return null;

  const isDriverRoute = pathname.startsWith("/chofer/");
  const showAdminMenu = !isDriverRoute && isAdmin;
  const homePath = isDriverRoute ? (pathname.includes("huerta-grande") ? "/chofer/huerta-grande" : "/chofer/la-falda") : userHomePath;
  const pedidosPath = isDriverRoute ? `${homePath}/pedidos` : "/pedidos";

  const mainMenu = [
    { name: "Inicio", icon: "🏠", path: homePath },
    { name: "Pedidos", icon: "📦", path: pedidosPath },
    ...(showAdminMenu ? [{ name: "Clientes", icon: "👥", path: "/clientes" }] : []),
  ];

  const moreMenu = [
    ...(showAdminMenu ? [{ name: "Historial de Ventas", icon: "📊", path: "/historial" }, { name: "Productos", icon: "🛒", path: "/productos" }, { name: "Cuenta corriente", icon: "📒", path: "/cuenta-corriente" }] : []),
  ];

  const isMoreActive = moreMenu.some(item => pathname.startsWith(item.path));

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 z-50">
      {isMoreOpen && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú Más"
            className="fixed inset-0 bottom-16 bg-black/10"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="absolute bottom-20 right-3 flex flex-col gap-3 rounded-3xl bg-white/95 p-4 shadow-xl ring-1 ring-gray-100 backdrop-blur-sm">
            {moreMenu.map(item => (
              <Link
                key={item.name}
                href={item.path}
                onClick={() => setIsMoreOpen(false)}
                className={`relative flex w-[62px] flex-col items-center gap-1 text-center ${pathname.startsWith(item.path) ? 'text-primary' : 'text-gray-600'}`}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-2xl shadow-sm ring-1 ${pathname.startsWith(item.path) ? 'ring-primary/40' : 'ring-gray-100'}`}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-bold leading-tight">{item.name}</span>
              </Link>
            ))}
            <button type="button" onClick={() => { localStorage.removeItem("los2hermanos_access_token"); localStorage.removeItem("los2hermanos_user"); router.replace("/login"); }} className="flex w-[62px] flex-col items-center gap-1 text-center text-red-600"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl shadow-sm">↪</span><span className="text-[10px] font-bold leading-tight">Salir</span></button>
          </div>
        </>
      )}

      <div className="relative flex h-full items-center justify-around border-t border-gray-200 bg-white shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.08)]">
      {mainMenu.map(item => {
        const isActive = pathname === item.path;
        return (
          <Link 
            key={item.name} 
            href={item.path}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-900'}`}
          >
            <div className="relative">
              <span className={`text-2xl ${isActive ? 'scale-110 transition-transform' : ''}`}>{item.icon}</span>
              {item.name === "Clientes" && totalUnread > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse shadow-sm">
                  {totalUnread}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold tracking-wide">{item.name}</span>
          </Link>
        )
      })}
      <button
        type="button"
        aria-expanded={isMoreOpen}
        aria-label="Abrir más opciones"
        onClick={() => setIsMoreOpen(open => !open)}
        className={`flex h-full w-full flex-col items-center justify-center space-y-1 transition-colors ${isMoreOpen || isMoreActive ? 'text-primary' : 'text-gray-400 hover:text-gray-900'}`}
      >
        <span className={`text-2xl transition-transform ${isMoreOpen ? 'rotate-90' : ''}`}>☰</span>
        <span className="text-[10px] font-bold tracking-wide">Más</span>
      </button>
      </div>
    </div>
  );
}
