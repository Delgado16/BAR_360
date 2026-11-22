// ============================================================================
// MI NEGOCIO PRO 360 — ESQUEMAS Y VALIDADORES DE CONFIGURACIÓN Y CATÁLOGOS (FASE 2)
// Replica todas las reglas de Data Validation del Excel en hojas 2, 4, 9 y 10
// ============================================================================

import { SYSTEM_FIXED_LISTS } from '../../domain/services/catalogs-config.service.ts';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
}

export interface BusinessSettingsFormInput {
  tradeName: string;
  businessType: string;
  currencyCode: string;
  operatingYear: number;
  analysisMonth: number;
  rankingCriterion: 'REVENUE' | 'UNITS';
  defaultCustomerCreditDays: number;
  defaultSupplierCreditDays: number;
  targetInventoryCoverage: number;
  taxTreatment: 'RECOVERABLE' | 'NON_RECOVERABLE';
  reconciliationTolerance: number;
}

export function validateBusinessSettingsInput(
  input: BusinessSettingsFormInput
): ValidationResult<BusinessSettingsFormInput> {
  const errors: string[] = [];

  if (!input.tradeName || !input.tradeName.trim()) {
    errors.push('El nombre comercial del negocio es obligatorio.');
  }
  if (input.operatingYear < 2000 || input.operatingYear > 2100 || !Number.isInteger(input.operatingYear)) {
    errors.push('El año de operación debe ser un número entero entre 2000 y 2100 (CONFIGURACIÓN!C9).');
  }
  if (input.analysisMonth < 1 || input.analysisMonth > 12 || !Number.isInteger(input.analysisMonth)) {
    errors.push('El mes de análisis debe estar entre 1 (Enero) y 12 (Diciembre) (CONFIGURACIÓN!C10:C11).');
  }
  if (input.defaultCustomerCreditDays < 0 || !Number.isInteger(input.defaultCustomerCreditDays)) {
    errors.push('Los días de crédito a clientes deben ser un entero mayor o igual a 0 (CONFIGURACIÓN!C18).');
  }
  if (input.defaultSupplierCreditDays < 0 || !Number.isInteger(input.defaultSupplierCreditDays)) {
    errors.push('Los días de crédito de proveedores deben ser un entero mayor o igual a 0 (CONFIGURACIÓN!C19).');
  }
  if (input.targetInventoryCoverage <= 0) {
    errors.push('La cobertura objetivo de inventario debe ser mayor a 0 (CONFIGURACIÓN!C20).');
  }
  if (input.reconciliationTolerance < 0 || input.reconciliationTolerance > 1) {
    errors.push('La tolerancia de conciliación debe estar entre 0 y 1 (CONFIGURACIÓN!C23).');
  }
  if (!SYSTEM_FIXED_LISTS.currencies.some((c) => c.code === input.currencyCode)) {
    errors.push(`Moneda '${input.currencyCode}' no válida.`);
  }

  return {
    success: errors.length === 0,
    data: errors.length === 0 ? input : undefined,
    errors,
  };
}

export interface TaxProfileFormInput {
  name: string;
  rate: number; // 0..1
}

export function validateTaxProfileInput(
  input: TaxProfileFormInput
): ValidationResult<TaxProfileFormInput> {
  const errors: string[] = [];
  if (!input.name || !input.name.trim()) {
    errors.push('El nombre del perfil de impuesto es obligatorio (CONFIGURACIÓN!B29:B33).');
  }
  if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 1) {
    errors.push('La tasa de impuesto debe ser un decimal entre 0 (0%) y 1 (100%) (CONFIGURACIÓN!C29:C33).');
  }
  return {
    success: errors.length === 0,
    data: errors.length === 0 ? { name: input.name.trim(), rate: input.rate } : undefined,
    errors,
  };
}

export interface ProductCatalogFormInput {
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  type: 'PRODUCT' | 'SERVICE';
  unitName: string;
  salePrice: number;
  referenceCost: number;
  preferredSupplierId?: string;
  minimumStock: number;
}

export function validateProductCatalogInput(
  input: ProductCatalogFormInput
): ValidationResult<ProductCatalogFormInput> {
  const errors: string[] = [];
  if (!input.sku || !input.sku.trim()) {
    errors.push('⚠ Falta código SKU.');
  }
  if (!input.name || !input.name.trim() || !input.categoryId || !input.unitName) {
    errors.push('⚠ Datos incompletos (nombre, categoría, tipo y unidad son obligatorios).');
  }
  if (input.salePrice < 0 || input.referenceCost < 0) {
    errors.push('⚠ Precio o costo negativo.');
  }
  if (input.type === 'PRODUCT' && (input.minimumStock === undefined || input.minimumStock < 0)) {
    errors.push('⚠ Falta stock mínimo válido para el producto.');
  }
  return {
    success: errors.length === 0,
    data: errors.length === 0 ? input : undefined,
    errors,
  };
}

