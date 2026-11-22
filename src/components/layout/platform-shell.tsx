import React from 'react';
import { PLATFORM_SIDEBAR_NAVIGATION } from '@/components/layout/navigation-config';

interface PlatformShellProps {
  title: string;
  subtitle: string;
  activeHref: string;
  children: React.ReactNode;
}

export function PlatformShell({ title, subtitle, activeHref, children }: PlatformShellProps) {
  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <aside className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            PLATAFORMA GLOBAL SaaS
          </div>
          <div className="mt-1 font-bold text-base">MI NEGOCIO PRO 360</div>
          <div className="mt-0.5 text-xs text-slate-400">Panel de Superadministración</div>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Menú de plataforma SaaS">
          {PLATFORM_SIDEBAR_NAVIGATION.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <a
                key={item.id}
                href={item.href}
                className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 text-xs text-slate-400">
          🔒 Privacidad Financiera Activa: Los datos contables de cada tenant están aislados.
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-slate-400">{subtitle}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
            Rol: SUPER_ADMIN
          </span>
        </div>

        {children}
      </main>
    </div>
  );
}
