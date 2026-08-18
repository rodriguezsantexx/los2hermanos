"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const logout = () => {
    localStorage.removeItem("los2hermanos_access_token");
    localStorage.removeItem("los2hermanos_user");
    router.replace("/login");
  };
  return <button onClick={logout} className="mt-3 w-full rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100">Cerrar sesión</button>;
}
