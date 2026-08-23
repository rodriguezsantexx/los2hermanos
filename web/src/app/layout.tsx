import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import { NotificationProvider } from "@/context/NotificationContext";

export const metadata: Metadata = {
  title: "Los 2 Hermanos - Admin",
  description: "Panel de administración",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="h-full bg-background text-foreground flex">
        <NotificationProvider>
          {/* Menú lateral (Oculto en celulares, visible en PC) */}
          <Sidebar />
          
          {/* Contenido Principal (Con margen inferior en móviles para que no lo tape la barra) */}
          <div className="flex-1 flex flex-col h-screen overflow-y-auto pb-20 md:pb-0">
            {children}
          </div>

          {/* Barra de navegación inferior (Visible solo en celulares) */}
          <MobileNav />
        </NotificationProvider>
      </body>
    </html>
  );
}
