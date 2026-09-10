"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirigir según la cuenta activa (restaurada desde localStorage si la
    // pestaña se cerró). Si no hay sesión, va al login.
    const user = getUser();
    const role = user?.roles?.nombre;
    if (role === "CHOFER_LA_FALDA") router.replace("/chofer/la-falda");
    else if (role === "CHOFER_HUERTA_GRANDE") router.replace("/chofer/huerta-grande");
    else if (role === "ADMIN") router.replace("/dashboard");
    else router.replace("/login");
  }, [router]);

  return null;
}
