// ============================================================================
// MI NEGOCIO PRO 360 — PÁGINA DE INICIO DE SESIÓN Y REGISTRO (Supabase Auth)
// ============================================================================

import React from 'react';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string; reset_sent?: string }>;
}) {
  const params = await searchParams;
  const errorMsg = params.error;
  const isEmailNotConfirmed = errorMsg === 'Email not confirmed';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="text-center mb-6">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            MI NEGOCIO PRO 360
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
            Acceso a tu Plataforma
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sistema Inteligente de Administración para Negocios
          </p>
        </div>

        {params.registered === '1' && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Cuenta creada correctamente. Revisa tu correo para confirmar tu cuenta antes de iniciar sesión (o confírmala en Supabase).
          </div>
        )}

        {params.reset_sent === '1' && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Si el correo existe, enviamos un enlace para restablecer tu contraseña.
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {isEmailNotConfirmed
              ? 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada o confirma el usuario en Supabase (Authentication → Users).'
              : errorMsg}
          </div>
        )}

        <form className="space-y-4" action="/api/auth/login" method="POST">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="propietario@minegocio.com"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Contraseña
              </label>
              <a href="/forgot-password" className="text-xs text-blue-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 text-sm transition-colors"
          >
            Iniciar sesión segura
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
          ¿Aún no tienes cuenta?{' '}
          <a href="/register" className="font-semibold text-blue-600 hover:underline">
            Registra tu empresa (14 días de prueba)
          </a>
        </div>
      </div>
    </div>
  );
}

