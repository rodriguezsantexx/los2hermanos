"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllSessions, getActiveUsername, setActiveSession } from "@/lib/session";

function roleLabel(role?: string): string {
  switch (role) {
    case "ADMIN": return "Administrador";
    case "CHOFER_LA_FALDA": return "Chofer La Falda";
    case "CHOFER_HUERTA_GRANDE": return "Chofer Huerta Grande";
    default: return "Usuario";
  }
}

function roleHome(role?: string): string {
  switch (role) {
    case "CHOFER_LA_FALDA": return "/chofer/la-falda";
    case "CHOFER_HUERTA_GRANDE": return "/chofer/huerta-grande";
    default: return "/dashboard";
  }
}

export default function AccountSwitcher({ variant = "dropdown" }: { variant?: "dropdown" | "inline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(getActiveUsername());
    setSessions(getAllSessions());
    setMounted(true);
  }, []);

  // Cerrar el menú al hacer click afuera (solo en modo dropdown)
  useEffect(() => {
    if (variant !== "dropdown") return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [variant]);

  if (!mounted) return null;

  const accounts = Object.entries(sessions);
  const activeUser = active ? sessions[active]?.user : null;
  const activeRole = activeUser?.roles?.nombre;

  const switchTo = (username: string) => {
    setActiveSession(username);
    setOpen(false);
    // Recargamos para que guards/menús tomen la nueva cuenta activa.
    router.replace(roleHome(sessions[username]?.user?.roles?.nombre));
    router.refresh();
  };

  // Modo inline: lista directa de cuentas (para menús móviles).
  if (variant === "inline") {
    if (accounts.length <= 1) return null;
    return (
      <div className="flex flex-col gap-1">
        <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Cambiar cuenta</p>
        {accounts.map(([username, sess]) => {
          const isActive = username === active;
          const role = sess?.user?.roles?.nombre;
          return (
            <button
              key={username}
              type="button"
              onClick={() => switchTo(username)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${isActive ? "bg-primary/10" : "hover:bg-gray-50"}`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-black text-gray-900">
                {(sess?.user?.nombre || username).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-gray-900">{sess?.user?.nombre || username}</p>
                <p className="truncate text-[10px] text-muted">{roleLabel(role)}</p>
              </div>
              {isActive && <span className="text-xs font-bold text-primary">✓</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 rounded-xl bg-gray-50 p-3 text-left hover:bg-gray-100 transition-colors"
        title="Cambiar de cuenta"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-gray-900 shadow-sm">
          {(activeUser?.nombre || active || "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900">{activeUser?.nombre || active || "Sin sesión"}</p>
          <p className="truncate text-xs text-muted">{roleLabel(activeRole)}</p>
        </div>
        {accounts.length > 1 && <span className="text-xs text-gray-400">▾</span>}
      </button>

      {open && accounts.length > 1 && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
          {accounts.map(([username, sess]) => {
            const isActive = username === active;
            const role = sess?.user?.roles?.nombre;
            return (
              <button
                key={username}
                type="button"
                onClick={() => switchTo(username)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? "bg-primary/10" : "hover:bg-gray-50"}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-black text-gray-900">
                  {(sess?.user?.nombre || username).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">{sess?.user?.nombre || username}</p>
                  <p className="truncate text-xs text-muted">{roleLabel(role)}</p>
                </div>
                {isActive && <span className="text-xs font-bold text-primary">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}