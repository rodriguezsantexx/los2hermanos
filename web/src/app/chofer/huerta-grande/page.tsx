import RoleGuard from "@/components/auth/RoleGuard";

export default function ChoferHuertaGrandePage() {
  return <RoleGuard allowedRole="CHOFER_HUERTA_GRANDE"><main className="flex-1 space-y-6 p-6 md:p-8"><p className="text-sm font-bold uppercase tracking-wider text-primary">Reparto</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Inicio</h1><p className="text-muted">Chofer Huerta Grande · Huerta Grande y Villa Giardino.</p><section className="grid grid-cols-2 gap-4"><div className="card"><p className="text-sm text-muted">Generado hoy</p><p className="mt-2 text-3xl font-black text-gray-900">$0</p></div><div className="card"><p className="text-sm text-muted">Pedidos de hoy</p><p className="mt-2 text-3xl font-black text-gray-900">0</p></div></section><section className="card"><h2 className="text-xl font-bold">Mis pedidos</h2><p className="mt-2 text-muted">No hay pedidos asignados todavía.</p></section></main></RoleGuard>;
}
