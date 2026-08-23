"use client";

import Link from "next/link";

const opciones = [
  { name: "Stock", description: "Controlá existencias y movimientos", icon: "📊", path: "/stock" },
  { name: "Clientes", description: "Consultá y administrá clientes", icon: "👥", path: "/clientes" },
];

export default function MenuPage() {
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto p-5 md:p-8">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Navegación</p>
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight mt-1">Más</h2>
        <p className="text-muted mt-1">Accedé a las demás herramientas del sistema.</p>
      </header>

      <nav aria-label="Más opciones" className="space-y-3">
        {opciones.map((opcion) => (
          <Link
            key={opcion.path}
            href={opcion.path}
            className="flex items-center gap-4 rounded-2xl bg-white border border-gray-100 p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-2xl">
              {opcion.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-gray-900">{opcion.name}</span>
              <span className="block text-sm text-muted mt-0.5">{opcion.description}</span>
            </span>
            <span className="text-xl text-gray-300" aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
