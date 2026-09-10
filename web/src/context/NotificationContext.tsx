"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getActiveSession, getToken } from '@/lib/session';
import { API_URL } from '@/lib/api';

export type Notificacion = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje?: string;
  destinatario_rol?: string;
  pedido_id?: string;
  leida: boolean;
  created_at: string;
};

type NotificationContextType = {
  unreadChats: string[];
  markAsRead: (chatId: string) => void;
  totalUnread: number;
  // Notificaciones del sistema (pedidos, gastos, etc.)
  notificaciones: Notificacion[];
  unreadNotificaciones: number;
  marcarNotificacionesLeidas: () => void;
  // Web Push nativo al celular
  pushPermiso: NotificationPermission;
  solicitarPermisoPush: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType>({
  unreadChats: [],
  markAsRead: () => {},
  totalUnread: 0,
  notificaciones: [],
  unreadNotificaciones: 0,
  marcarNotificacionesLeidas: () => {},
  pushPermiso: "default",
  solicitarPermisoPush: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

function getRolActivo(): string | null {
  try {
    const session = getActiveSession();
    return session?.user?.roles?.nombre || null;
  } catch {
    return null;
  }
}

/** Convierte una clave pública VAPID (base64url) a Uint8Array para pushManager. */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unreadChats, setUnreadChats] = useState<string[]>([]);
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [pushPermiso, setPushPermiso] = useState<NotificationPermission>("default");
  const lastPushUserRef = useRef<string | null>(null);

  // ─── Web Push: registrar la suscripción del navegador ────────────────────
  const registrarPush = async () => {
    try {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const token = getToken();
      if (!token) return;
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch(`${API_URL}/api/notificaciones/vapid-public-key`);
      if (!res.ok) return;
      const { public_key } = await res.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
      await fetch(`${API_URL}/api/notificaciones/suscripcion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch (e) {
      console.error("Error registrando push:", e);
    }
  };

  const solicitarPermisoPush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permiso = await Notification.requestPermission();
    setPushPermiso(permiso);
    if (permiso === "granted") await registrarPush();
  };

  // Si ya hay permiso, registrar la suscripción (y re-registrar al cambiar de cuenta)
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPushPermiso(Notification.permission);
    const check = () => {
      const user = getActiveSession()?.user;
      const uid = user?.id || null;
      if (uid && uid !== lastPushUserRef.current && Notification.permission === "granted") {
        lastPushUserRef.current = uid;
        registrarPush();
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  // Cargar el historial de lectura al inicio
  useEffect(() => {
    const saved = localStorage.getItem('los2hermanos_last_read');
    if (saved) {
      try {
        setLastReadMap(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  // Revisar chats constantemente para ver si hay actualizaciones nuevas
  useEffect(() => {
    const checkUnread = async () => {
      const { data } = await supabase.from('whatsapp_chats').select('id, updated_at');
      if (data) {
        const newUnread: string[] = [];
        data.forEach(chat => {
          const chatTime = new Date(chat.updated_at).getTime();
          const lastReadTime = lastReadMap[chat.id] || 0;
          if (chatTime > lastReadTime + 1000) { // Un margen de 1 segundo
            newUnread.push(chat.id);
          }
        });
        setUnreadChats(newUnread);
      }
    };

    checkUnread();
    const interval = setInterval(checkUnread, 3000);
    return () => clearInterval(interval);
  }, [lastReadMap]);

  // Notificaciones del sistema: suscripción Realtime filtrada por rol
  useEffect(() => {
    let channel: any = null;
    let rolActual = getRolActivo();

    const fetchNotificaciones = async () => {
      const rol = getRolActivo();
      if (!rol) return;
      const { data } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('destinatario_rol', rol)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setNotificaciones(data as Notificacion[]);
    };

    const setup = () => {
      if (channel) supabase.removeChannel(channel);
      if (!rolActual) return;
      channel = supabase
        .channel(`notificaciones_${rolActual}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones',
            filter: `destinatario_rol=eq.${rolActual}`,
          },
          (payload) => {
            setNotificaciones((prev) => [payload.new as Notificacion, ...prev]);
          }
        )
        .subscribe();
    };

    fetchNotificaciones();
    setup();

    // Si cambia la cuenta activa (AccountSwitcher), re-suscribirse al rol nuevo
    const interval = setInterval(() => {
      const nuevoRol = getRolActivo();
      if (nuevoRol !== rolActual) {
        rolActual = nuevoRol;
        fetchNotificaciones();
        setup();
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = (chatId: string) => {
    setLastReadMap(prev => {
      const newMap = { ...prev, [chatId]: Date.now() };
      localStorage.setItem('los2hermanos_last_read', JSON.stringify(newMap));
      return newMap;
    });
    setUnreadChats(prev => prev.filter(id => id !== chatId));
  };

  const marcarNotificacionesLeidas = async () => {
    const rol = getRolActivo();
    if (!rol) return;
    const unreadIds = notificaciones.filter(n => !n.leida).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notificaciones').update({ leida: true }).in('id', unreadIds);
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
  };

  return (
    <NotificationContext.Provider
      value={{
        unreadChats,
        markAsRead,
        totalUnread: unreadChats.length,
        notificaciones,
        unreadNotificaciones: notificaciones.filter(n => !n.leida).length,
        marcarNotificacionesLeidas,
        pushPermiso,
        solicitarPermisoPush,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
