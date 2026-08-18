"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type Role = "ADMIN" | "CHOFER_LA_FALDA" | "CHOFER_HUERTA_GRANDE";

const roleHome: Record<Role, string> = {
  ADMIN: "/dashboard",
  CHOFER_LA_FALDA: "/chofer/la-falda",
  CHOFER_HUERTA_GRANDE: "/chofer/huerta-grande",
};

export default function RoleGuard({ allowedRole, children }: { allowedRole: Role; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("los2hermanos_user") || "null");
      const role = user?.roles?.nombre as Role | undefined;
      if (!role) {
        router.replace("/login");
        return;
      }
      if (role !== allowedRole) {
        router.replace(roleHome[role] || "/login");
        return;
      }
      setAuthorized(true);
    } catch {
      router.replace("/login");
    }
  }, [allowedRole, pathname, router]);

  if (!authorized) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-muted">Cargando panel…</main>;
  }

  return <>{children}</>;
}
