import React from 'react';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="text-center mb-6">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            MI NEGOCIO PRO 360
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
            Registra tu Empresa
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Comienza tu prueba gratuita de 14 días sin tarjeta de crédito
          </p>
        </div>

        <form className="space-y-4" action="/api/auth/register" method="POST">
          <div>
            <label htmlFor="tradeName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nombre comercial del negocio
            </label>
            <input
              id="tradeName"
              name="tradeName"
              type="text"
              required
              placeholder="Ej. Distribuidora Central"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Tu nombre completo
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="Ej. Carlos Mendoza"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

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
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Contraseña (mínimo 8 caracteres)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 text-sm transition-colors"
          >
            Crear cuenta y empezar prueba de 14 días
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
          ¿Ya tienes una cuenta?{' '}
          <a href="/login" className="font-semibold text-blue-600 hover:underline">
            Inicia sesión aquí
          </a>
        </div>
      </div>
    </div>
  );
}
