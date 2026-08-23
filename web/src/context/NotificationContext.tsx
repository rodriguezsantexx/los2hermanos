"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type NotificationContextType = {
  unreadChats: string[];
  markAsRead: (chatId: string) => void;
  totalUnread: number;
};

const NotificationContext = createContext<NotificationContextType>({
  unreadChats: [],
  markAsRead: () => {},
  totalUnread: 0,
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unreadChats, setUnreadChats] = useState<string[]>([]);
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});

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

  const markAsRead = (chatId: string) => {
    setLastReadMap(prev => {
      const newMap = { ...prev, [chatId]: Date.now() };
      localStorage.setItem('los2hermanos_last_read', JSON.stringify(newMap));
      return newMap;
    });
    setUnreadChats(prev => prev.filter(id => id !== chatId));
  };

  return (
    <NotificationContext.Provider value={{ unreadChats, markAsRead, totalUnread: unreadChats.length }}>
      {children}
    </NotificationContext.Provider>
  );
}
