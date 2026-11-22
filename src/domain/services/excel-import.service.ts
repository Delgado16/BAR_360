// ============================================================================
// MI NEGOCIO PRO 360 — FASE 8: SERVICIO DE IMPORTACIÓN Y MIGRACIÓN DESDE EXCEL
// Implementa el asistente de 12 pasos (Sección 22) y la Prueba #29:
// - Identificación de hojas y mapeo de columnas del libro MI_NEGOCIO_PRO_360
// - Validación de tipos, detección de duplicados y referencias faltantes
// - Vista previa sin mutación de datos
// - Ejecución transaccional repetible (idempotente) sin duplicar documentos
// - Recálculo independiente en servidor y conciliación contra valores del Excel
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import {
  calculateSaleLine,
  calculatePurchaseLine,
  calculateOperatingExpense,
  excelRound,
} from '../calculations/financial-engine.ts';
import { EnterpriseSaaSEngine } from './enterprise-saas.service.ts';
import { InventoryAndCostingService } from './inventory-costing.service.ts';
import { FinanceAndTreasuryService } from './finance-treasury.service.ts';

export interface ExcelImportWorkbookPayload {
  suppliers?: Array<{
    code: string;
    name: string;
    contactName?: string;
    phone?: string;
    email?: string;
  }>;
  customers?: Array<{
    code: string;
    name: string;
    phone?: string;
    email?: string;
    customerType: 'REGISTERED' | 'GENERIC';
  }>;
  products?: Array<{
    sku: string;
    name: string;
    description?: string;
    categoryName: string;
    type: 'PRODUCT' | 'SERVICE';
    unitName: string;
    salePrice: number;
    referenceCost: number;
    preferredSupplierName?: string;
    minimumStock: number;
  }>;
  openingBalances?: Array<{
    sku: string;
    quantity: number;
    unitCost: number;
  }>;
  purchases?: Array<{
    purchaseNumber: string;
    date: string;
    supplierName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    discountPercentage?: number;
    taxProfileName: string;
    paymentCondition: 'CASH' | 'CREDIT';
    accountName?: string;
    excelReportedTotal?: number;
  }>;
  expenses?: Array<{
    expenseNumber: string;
    date: string;
    categoryName: string;
    description: string;
    netAmount: number;
    taxProfileName: string;
    paymentCondition: 'CASH' | 'CREDIT';
    paymentMethodName?: string;
    accountName?: string;
    excelReportedTotal?: number;
  }>;
  sales?: Array<{
    saleNumber: string;
    date: string;
    customerName: string;
    paymentCondition: 'CASH' | 'CREDIT';
    paymentMethodName?: string;
    accountName?: string;
    lines: Array<{
      sku: string;
      quantity: number;
      unitPrice: number;
      discountPercentage?: number;
      taxProfileName: string;
      excelReportedLineTotal?: number;
    }>;
  }>;
}

export interface ImportValidationIssue {
  sheet: string;
  rowRef: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface ImportPreviewReport {
  detectedSheets: string[];
  canCommit: boolean;
  counts: {
    suppliers: number;
    customers: number;
    products: number;
    openingBalances: number;
    purchases: number;
    expenses: number;
    sales: number;
  };
  issues: ImportValidationIssue[];
  reconciliationDiscrepancies: Array<{
    sheet: string;
    documentRef: string;
    excelValue: number;
    serverRecalculatedValue: number;
    difference: number;
  }>;
}

export interface ImportExecutionResult {
  committed: boolean;
  inserted: {
    suppliers: number;
    customers: number;
    products: number;
    openingBalancesUpdated: number;
    purchases: number;
    expenses: number;
    sales: number;
  };
  skippedDuplicates: {
    suppliers: number;
    customers: number;
    products: number;
    purchases: number;
    expenses: number;
    sales: number;
  };
  reconciliationDiscrepancies: ImportPreviewReport['reconciliationDiscrepancies'];
}

export interface TenantCatalogLookup {
  supplierIdsByName: Map<string, string>;
  customerIdsByName: Map<string, string>;
  productCategoryIdsByName: Map<string, string>;
  expenseCategoryIdsByName: Map<string, string>;
  taxProfilesByName: Map<string, { id: string; rate: number }>;
  accountIdsByName: Map<string, string>;
  paymentMethodIdsByName: Map<string, string>;
}

export class ExcelImportService {
  private readonly engine: EnterpriseSaaSEngine;
  private readonly inventoryService: InventoryAndCostingService;
  private readonly financeService: FinanceAndTreasuryService;

  // Registro idempotente de documentos ya importados por tenant para soportar importación repetida (Prueba #29)
  private importedKeysByTenant = new Map<string, Set<string>>();

  constructor(
    engine: EnterpriseSaaSEngine,
    inventoryService: InventoryAndCostingService,
    financeService: FinanceAndTreasuryService
  ) {
    this.engine = engine;
    this.inventoryService = inventoryService;
    this.financeService = financeService;
  }

  private getImportedSet(tenantId: string): Set<string> {
    let set = this.importedKeysByTenant.get(tenantId);
    if (!set) {
      set = new Set<string>();
      this.importedKeysByTenant.set(tenantId, set);
    }
    return set;
  }

  public analyzeAndPreviewImport(
    ctx: AuthenticatedTenantContext,
    payload: ExcelImportWorkbookPayload,
    lookup: TenantCatalogLookup
  ): ImportPreviewReport {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'excel_import', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);

    const detectedSheets: string[] = [];
    if (payload.suppliers?.length) detectedSheets.push('PROVEEDORES');
    if (payload.customers?.length) detectedSheets.push('CLIENTES');
    if (payload.products?.length) detectedSheets.push('PRODUCTOS Y SERVICIOS');
    if (payload.openingBalances?.length) detectedSheets.push('INVENTARIO');
    if (payload.purchases?.length) detectedSheets.push('COMPRAS');
    if (payload.expenses?.length) detectedSheets.push('GASTOS OPERATIVOS');
    if (payload.sales?.length) detectedSheets.push('REGISTRO DE VENTAS');

    const issues: ImportValidationIssue[] = [];
    const reconciliationDiscrepancies: ImportPreviewReport['reconciliationDiscrepancies'] = [];

    const existingProducts = this.engine.listProducts(ctx, ctx.tenantId);
    const knownSkus = new Set(existingProducts.map((p) => p.sku));
    const batchSkus = new Set<string>();

    // Validar Productos
    for (const [idx, prod] of (payload.products ?? []).entries()) {
      const rowRef = `Fila ${idx + 7}`;
      if (!prod.sku.trim() || !prod.name.trim()) {
        issues.push({ sheet: 'PRODUCTOS Y SERVICIOS', rowRef, severity: 'ERROR', message: 'Falta SKU o Nombre.' });
      }
      if (batchSkus.has(prod.sku)) {
        issues.push({
          sheet: 'PRODUCTOS Y SERVICIOS',
          rowRef,
          severity: 'ERROR',
          message: `SKU duplicado dentro del archivo (${prod.sku}).`,
        });
      }
      batchSkus.add(prod.sku);
      knownSkus.add(prod.sku);

      if (!lookup.productCategoryIdsByName.has(prod.categoryName)) {
        issues.push({
          sheet: 'PRODUCTOS Y SERVICIOS',
          rowRef,
          severity: 'ERROR',
          message: `Categoría de producto no encontrada: '${prod.categoryName}'.`,
        });
      }
      if (prod.salePrice < 0 || prod.referenceCost < 0) {
        issues.push({
          sheet: 'PRODUCTOS Y SERVICIOS',
          rowRef,
          severity: 'ERROR',
          message: 'Precio o costo negativo.',
        });
      }
    }

    // Validar Saldos Iniciales
    for (const [idx, ob] of (payload.openingBalances ?? []).entries()) {
      const rowRef = `Fila ${idx + 7}`;
      if (!knownSkus.has(ob.sku)) {
        issues.push({
          sheet: 'INVENTARIO',
          rowRef,
          severity: 'ERROR',
          message: `SKU '${ob.sku}' no existe en catálogo ni en la hoja de productos a importar.`,
        });
      }
      if (ob.quantity < 0 || ob.unitCost < 0) {
        issues.push({
          sheet: 'INVENTARIO',
          rowRef,
          severity: 'ERROR',
          message: 'Stock inicial o costo inicial negativo.',
        });
      }
    }

    // Validar Compras y conciliar contra valores calculados del Excel
    const knownSuppliers = new Set([
      ...lookup.supplierIdsByName.keys(),
      ...(payload.suppliers ?? []).map((s) => s.name),
    ]);
    for (const [idx, comp] of (payload.purchases ?? []).entries()) {
      const rowRef = `Fila ${idx + 7}`;
      if (!knownSuppliers.has(comp.supplierName)) {
        issues.push({
          sheet: 'COMPRAS',
          rowRef,
          severity: 'ERROR',
          message: `Proveedor no registrado: '${comp.supplierName}'.`,
        });
      }
      if (!knownSkus.has(comp.sku)) {
        issues.push({
          sheet: 'COMPRAS',
          rowRef,
          severity: 'ERROR',
          message: `SKU no encontrado: '${comp.sku}'.`,
        });
      }
      const tax = lookup.taxProfilesByName.get(comp.taxProfileName);
      if (!tax) {
        issues.push({
          sheet: 'COMPRAS',
          rowRef,
          severity: 'ERROR',
          message: `Perfil de impuesto no encontrado: '${comp.taxProfileName}'.`,
        });
      } else if (comp.excelReportedTotal !== undefined) {
        const calc = calculatePurchaseLine({
          quantity: comp.quantity,
          unitCost: comp.unitCost,
          discountPercentage: comp.discountPercentage ?? 0,
          taxRate: tax.rate,
          taxTreatment: settings.taxTreatment,
        });
        const diff = excelRound(comp.excelReportedTotal - calc.lineTotal, 2);
        if (Math.abs(diff) > settings.reconciliationTolerance) {
          reconciliationDiscrepancies.push({
            sheet: 'COMPRAS',
            documentRef: comp.purchaseNumber,
            excelValue: comp.excelReportedTotal,
            serverRecalculatedValue: calc.lineTotal,
            difference: diff,
          });
        }
      }
    }

    // Validar Gastos y conciliar
    for (const [idx, gas] of (payload.expenses ?? []).entries()) {
      const rowRef = `Fila ${idx + 7}`;
      if (!lookup.expenseCategoryIdsByName.has(gas.categoryName)) {
        issues.push({
          sheet: 'GASTOS OPERATIVOS',
          rowRef,
          severity: 'ERROR',
          message: `Categoría de gasto no encontrada: '${gas.categoryName}'.`,
        });
      }
      const tax = lookup.taxProfilesByName.get(gas.taxProfileName);
      if (!tax) {
        issues.push({
          sheet: 'GASTOS OPERATIVOS',
          rowRef,
          severity: 'ERROR',
          message: `Perfil de impuesto no encontrado: '${gas.taxProfileName}'.`,
        });
      } else if (gas.excelReportedTotal !== undefined) {
        const calc = calculateOperatingExpense({
          netAmount: gas.netAmount,
          taxRate: tax.rate,
          taxTreatment: settings.taxTreatment,
        });
        const diff = excelRound(gas.excelReportedTotal - calc.totalAmount, 2);
        if (Math.abs(diff) > settings.reconciliationTolerance) {
          reconciliationDiscrepancies.push({
            sheet: 'GASTOS OPERATIVOS',
            documentRef: gas.expenseNumber,
            excelValue: gas.excelReportedTotal,
            serverRecalculatedValue: calc.totalAmount,
            difference: diff,
          });
        }
      }
    }

    // Validar Ventas y conciliar cada línea
    const knownCustomers = new Set([
      ...lookup.customerIdsByName.keys(),
      ...(payload.customers ?? []).map((c) => c.name),
    ]);
    for (const [idx, vta] of (payload.sales ?? []).entries()) {
      const rowRef = `Venta ${vta.saleNumber} (#${idx + 1})`;
      if (!knownCustomers.has(vta.customerName)) {
        issues.push({
          sheet: 'REGISTRO DE VENTAS',
          rowRef,
          severity: 'ERROR',
          message: `Cliente no registrado: '${vta.customerName}'.`,
        });
      }
      for (const l of vta.lines) {
        if (!knownSkus.has(l.sku)) {
          issues.push({
            sheet: 'REGISTRO DE VENTAS',
            rowRef,
            severity: 'ERROR',
            message: `SKU no encontrado: '${l.sku}'.`,
          });
        }
        const tax = lookup.taxProfilesByName.get(l.taxProfileName);
        if (!tax) {
          issues.push({
            sheet: 'REGISTRO DE VENTAS',
            rowRef,
            severity: 'ERROR',
            message: `Perfil fiscal no encontrado: '${l.taxProfileName}'.`,
          });
        } else if (l.excelReportedLineTotal !== undefined) {
          const calc = calculateSaleLine({
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercentage: l.discountPercentage ?? 0,
            taxRate: tax.rate,
            historicalUnitCost: 0,
          });
          const diff = excelRound(l.excelReportedLineTotal - calc.lineTotal, 2);
          if (Math.abs(diff) > settings.reconciliationTolerance) {
            reconciliationDiscrepancies.push({
              sheet: 'REGISTRO DE VENTAS',
              documentRef: `${vta.saleNumber}:${l.sku}`,
              excelValue: l.excelReportedLineTotal,
              serverRecalculatedValue: calc.lineTotal,
              difference: diff,
            });
          }
        }
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'ERROR');
    return {
      detectedSheets,
      canCommit: !hasErrors,
      counts: {
        suppliers: payload.suppliers?.length ?? 0,
        customers: payload.customers?.length ?? 0,
        products: payload.products?.length ?? 0,
        openingBalances: payload.openingBalances?.length ?? 0,
        purchases: payload.purchases?.length ?? 0,
        expenses: payload.expenses?.length ?? 0,
        sales: payload.sales?.length ?? 0,
      },
      issues,
      reconciliationDiscrepancies,
    };
  }

  /**
   * Ejecuta la importación de manera transaccional e idempotente (repetible sin duplicados).
   */
  public executeValidatedImport(
    ctx: AuthenticatedTenantContext,
    payload: ExcelImportWorkbookPayload,
    lookup: TenantCatalogLookup
  ): ImportExecutionResult {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'excel_import', 'CREATE');

    const preview = this.analyzeAndPreviewImport(ctx, payload, lookup);
    if (!preview.canCommit) {
      const errorList = preview.issues
        .filter((i) => i.severity === 'ERROR')
        .map((i) => `[${i.sheet} ${i.rowRef}] ${i.message}`)
        .join('; ');
      throw new Error(`Importación abortada por errores de validación: ${errorList}`);
    }

    const importedSet = this.getImportedSet(ctx.tenantId);

    const inserted = {
      suppliers: 0,
      customers: 0,
      products: 0,
      openingBalancesUpdated: 0,
      purchases: 0,
      expenses: 0,
      sales: 0,
    };
    const skippedDuplicates = {
      suppliers: 0,
      customers: 0,
      products: 0,
      purchases: 0,
      expenses: 0,
      sales: 0,
    };

    // 1. Proveedores
    for (const s of payload.suppliers ?? []) {
      const key = `SUP:${s.code}`;
      if (importedSet.has(key) || lookup.supplierIdsByName.has(s.name)) {
        skippedDuplicates.suppliers++;
        continue;
      }
      const id = `imp-sup-${s.code}-${Date.now()}`;
      this.engine.createSupplier(ctx, {
        id,
        code: s.code,
        name: s.name,
        contactName: s.contactName,
        phone: s.phone,
        email: s.email,
      });
      lookup.supplierIdsByName.set(s.name, id);
      importedSet.add(key);
      inserted.suppliers++;
    }

    // 2. Clientes
    for (const c of payload.customers ?? []) {
      const key = `CLI:${c.code}`;
      if (importedSet.has(key) || lookup.customerIdsByName.has(c.name)) {
        skippedDuplicates.customers++;
        continue;
      }
      const id = `imp-cli-${c.code}-${Date.now()}`;
      this.engine.createCustomer(ctx, {
        id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        email: c.email,
        customerType: c.customerType,
      });
      lookup.customerIdsByName.set(c.name, id);
      importedSet.add(key);
      inserted.customers++;
    }

    // 3. Productos y Servicios
    const existingProductsBySku = new Map(
      this.engine.listProducts(ctx, ctx.tenantId).map((p) => [p.sku, p])
    );
    for (const p of payload.products ?? []) {
      const key = `PROD:${p.sku}`;
      if (importedSet.has(key) || existingProductsBySku.has(p.sku)) {
        skippedDuplicates.products++;
        continue;
      }
      const id = `imp-prod-${p.sku}-${Date.now()}`;
      const created = this.engine.createProduct(ctx, {
        id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        categoryId: lookup.productCategoryIdsByName.get(p.categoryName)!,
        type: p.type,
        unitName: p.unitName,
        salePrice: p.salePrice,
        referenceCost: p.referenceCost,
        preferredSupplierId: p.preferredSupplierName
          ? lookup.supplierIdsByName.get(p.preferredSupplierName)
          : undefined,
        minimumStock: p.minimumStock,
        openingStockQuantity: 0,
        openingUnitCost: 0,
      });
      existingProductsBySku.set(p.sku, created);
      importedSet.add(key);
      inserted.products++;
    }

    // 4. Saldos Iniciales de Inventario
    for (const ob of payload.openingBalances ?? []) {
      const key = `OB:${ob.sku}:${ob.quantity}:${ob.unitCost}`;
      if (importedSet.has(key)) continue;
      const prod = existingProductsBySku.get(ob.sku)!;
      this.inventoryService.setOpeningBalance(ctx, prod.id, ob.quantity, ob.unitCost);
      importedSet.add(key);
      inserted.openingBalancesUpdated++;
    }

    // 5. Compras Históricas
    for (const comp of payload.purchases ?? []) {
      const key = `COMP:${comp.purchaseNumber}`;
      if (importedSet.has(key)) {
        skippedDuplicates.purchases++;
        continue;
      }
      const prod = existingProductsBySku.get(comp.sku)!;
      const tax = lookup.taxProfilesByName.get(comp.taxProfileName)!;
      this.inventoryService.registerPurchaseWithCostingRecalculation(ctx, {
        id: `imp-comp-${comp.purchaseNumber}`,
        purchaseNumber: comp.purchaseNumber,
        supplierId: lookup.supplierIdsByName.get(comp.supplierName)!,
        date: comp.date,
        productId: prod.id,
        quantity: comp.quantity,
        unitCost: comp.unitCost,
        discountPercentage: comp.discountPercentage,
        taxProfileId: tax.id,
        paymentCondition: comp.paymentCondition,
        financialAccountId: comp.accountName ? lookup.accountIdsByName.get(comp.accountName) : undefined,
        idempotencyKey: `imp-${comp.purchaseNumber}`,
      });
      importedSet.add(key);
      inserted.purchases++;
    }

    // 6. Gastos Históricos
    for (const gas of payload.expenses ?? []) {
      const key = `GAS:${gas.expenseNumber}`;
      if (importedSet.has(key)) {
        skippedDuplicates.expenses++;
        continue;
      }
      const tax = lookup.taxProfilesByName.get(gas.taxProfileName)!;
      this.financeService.registerExpense(ctx, {
        id: `imp-gas-${gas.expenseNumber}`,
        expenseNumber: gas.expenseNumber,
        date: gas.date,
        categoryId: lookup.expenseCategoryIdsByName.get(gas.categoryName)!,
        description: gas.description,
        netAmount: gas.netAmount,
        taxProfileId: tax.id,
        paymentCondition: gas.paymentCondition,
        paymentMethodId: gas.paymentMethodName
          ? lookup.paymentMethodIdsByName.get(gas.paymentMethodName)
          : undefined,
        financialAccountId: gas.accountName ? lookup.accountIdsByName.get(gas.accountName) : undefined,
        idempotencyKey: `imp-${gas.expenseNumber}`,
      });
      importedSet.add(key);
      inserted.expenses++;
    }

    // 7. Ventas Históricas
    for (const vta of payload.sales ?? []) {
      const key = `VTA:${vta.saleNumber}`;
      if (importedSet.has(key)) {
        skippedDuplicates.sales++;
        continue;
      }
      this.engine.registerSale(ctx, {
        id: `imp-vta-${vta.saleNumber}`,
        saleNumber: vta.saleNumber,
        customerId: lookup.customerIdsByName.get(vta.customerName)!,
        date: vta.date,
        paymentCondition: vta.paymentCondition,
        paymentMethodId: vta.paymentMethodName
          ? lookup.paymentMethodIdsByName.get(vta.paymentMethodName)
          : undefined,
        financialAccountId: vta.accountName ? lookup.accountIdsByName.get(vta.accountName) : undefined,
        idempotencyKey: `imp-${vta.saleNumber}`,
        lines: vta.lines.map((l) => ({
          productId: existingProductsBySku.get(l.sku)!.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercentage: l.discountPercentage,
          taxProfileId: lookup.taxProfilesByName.get(l.taxProfileName)!.id,
        })),
      });
      importedSet.add(key);
      inserted.sales++;
    }

    return {
      committed: true,
      inserted,
      skippedDuplicates,
      reconciliationDiscrepancies: preview.reconciliationDiscrepancies,
    };
  }
}
