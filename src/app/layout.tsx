import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MI NEGOCIO PRO 360 — Sistema Inteligente de Administración para Negocios',
  description: 'Plataforma SaaS multiempresa de gestión comercial, inventario CPP, finanzas y reportes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
