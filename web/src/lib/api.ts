const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : localStorage.getItem("los2hermanos_access_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || "No se pudo completar la operación");
  return data as T;
}
