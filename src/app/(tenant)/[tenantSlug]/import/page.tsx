// ============================================================================
// MI NEGOCIO PRO 360 — MÓDULO WEB: ASISTENTE DE IMPORTACIÓN DESDE EXCEL (Sección 22)
// ============================================================================

import React from 'react';

export default function ExcelImportWizardPage() {
  const steps = [
    '1. Cargar archivo (.xlsx)',
    '2. Analizar hojas y mapear columnas',
    '3. Validar tipos, duplicados y referencias',
    '4. Vista previa y conciliación',
    '5. Confirmar importación transaccional',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Asistente de Importación y Migración desde Excel
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Importe sus datos desde MI_NEGOCIO_PRO_360.xlsx o plantillas compatibles. El sistema recalcula los importes en el servidor y evita duplicados ante reintentos.
        </p>
      </div>

      {/* Pasos del Asistente */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`rounded-lg border p-3 text-xs font-semibold ${
              i === 0
                ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500'
            }`}
          >
            {step}
          </div>
        ))}
      </div>

      {/* Zona de carga */}
      <section className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-4">
        <div className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Seleccione su archivo Excel (.xlsx)
        </div>
        <p className="text-xs text-slate-500 max-w-lg mx-auto">
          Hojas compatibles: PRODUCTOS Y SERVICIOS, CLIENTES, PROVEEDORES, INVENTARIO (saldos iniciales), COMPRAS, GASTOS OPERATIVOS y REGISTRO DE VENTAS.
        </p>
        <input
          type="file"
          accept=".xlsx"
          className="mx-auto block text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        />
      </section>
    </div>
  );
}
