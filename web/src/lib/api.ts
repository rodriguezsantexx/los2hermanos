const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}`;

import { getToken, logoutActive } from "@/lib/session";

/** Si el backend responde 401 (token expirado/inválido), limpia la sesión
 *  y manda al login en vez de dejar pantallas vacías en silencio. */
function handleUnauthorized() {
  if (typeof window === "undefined") return;
  logoutActive();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Sesión expirada. Volvé a iniciar sesión.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || "No se pudo completar la operación");
  return data as T;
}
