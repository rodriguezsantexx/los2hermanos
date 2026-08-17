import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

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
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className={`${inter.className} h-full bg-background text-foreground flex`}>
        {/* Menú lateral (Oculto en celulares, visible en PC) */}
        <Sidebar />
        
        {/* Contenido Principal (Con margen inferior en móviles para que no lo tape la barra) */}
        <div className="flex-1 flex flex-col h-screen overflow-y-auto pb-20 md:pb-0">
          {children}
        </div>

        {/* Barra de navegación inferior (Visible solo en celulares) */}
        <MobileNav />
      </body>
    </html>
  );
}
