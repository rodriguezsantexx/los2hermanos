"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Credenciales incorrectas");
      localStorage.setItem("los2hermanos_access_token", data.access_token);
      localStorage.setItem("los2hermanos_user", JSON.stringify(data.profile || data.user));
      const role = data.profile?.roles?.nombre;
      router.push(role === "CHOFER_LA_FALDA" ? "/chofer/la-falda" : role === "CHOFER_HUERTA_GRANDE" ? "/chofer/huerta-grande" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl md:p-9">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl text-white">🚚</div>
          <h1 className="text-2xl font-black text-gray-900">Los 2 Hermanos</h1>
          <p className="mt-1 text-muted">Ingresá al panel de gestión</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-bold text-gray-700">Nombre de usuario<input required type="text" value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 outline-none focus:border-primary" placeholder="Administrador" /></label>
          <label className="block text-sm font-bold text-gray-700">Contraseña<input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 outline-none focus:border-primary" placeholder="••••••••" /></label>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}
          <button disabled={loading} className="btn-primary w-full disabled:opacity-50">{loading ? "Ingresando..." : "Iniciar sesión"}</button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-400">El acceso determina automáticamente si sos Administrador, Chofer La Falda o Chofer Huerta Grande.</p>
      </section>
    </main>
  );
}
