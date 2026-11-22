'use client';

import React, { useState, useTransition } from 'react';
import { createTenantUserAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface TenantUserRow {
  id: string;
  fullName: string;
  email: string;
  roleName: string;
  roleCode: string;
  status: string;
}

export function UsersClient({
  tenantSlug,
  users,
}: {
  tenantSlug: string;
  users: TenantUserRow[];
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createTenantUserAction(tenantSlug, formData);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Usuarios y Roles del Negocio
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Crea cuentas separadas para Barra/Vendedor, Cocina y Administración. Al iniciar sesión en /login, cada usuario entrará directo a su pantalla.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            feedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <form
        action={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
      >
        <h2 className="text-base font-semibold">Agregar Nuevo Usuario del Equipo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre Completo *</label>
            <input
              name="fullName"
              required
              placeholder="Ej. Luis (Barra) o María (Cocina)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rol en el Negocio *</label>
            <select
              name="roleChoice"
              defaultValue="CASHIER_SELLER"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="CASHIER_SELLER">Vendedor / Barra (Entra al POS)</option>
              <option value="KITCHEN">Cocina (Solo ve Comandas)</option>
              <option value="TENANT_OWNER">Propietario / Admin (Acceso total)</option>
              <option value="INVENTORY_MANAGER">Encargado de Inventario</option>
              <option value="ACCOUNTANT_FINANCE">Contador / Finanzas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Correo electrónico *</label>
            <input
              name="email"
              type="email"
              required
              placeholder="barra@tubar.com"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Contraseña (mínimo 6 caracteres) *
            </label>
            <input
              name="password"
              type="password"
              minLength={6}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? 'Creando usuario...' : '+ Crear Usuario'}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Rol Asignado</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No hay usuarios asignados todavía a esta empresa.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                        {u.roleName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-700">{u.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
