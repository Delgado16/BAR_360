// ============================================================================
// MI NEGOCIO PRO 360 — FASE 2: SERVICIO DE CONFIGURACIÓN Y CATÁLOGOS EMPRESARIALES
// Implementa todas las reglas, listas, validaciones y fórmulas derivadas de las hojas:
// - Hoja 2: CONFIGURACIÓN (datos generales, parámetros fiscales, impuestos, listas, cuentas)
// - Hoja 4: PRODUCTOS Y SERVICIOS (tblProductos, margen estimado, prod_Control, lst_SKU / lst_SKUprod)
// - Hoja 9: CLIENTES (tblClientes, totales del año, saldo, cli_Control, cli_Rank sin mostrador)
// - Hoja 10: PROVEEDORES (tblProveedores, conteo productos en catálogo, totales, prv_Control)
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import { excelRound } from '../calculations/financial-engine.ts';
import {
  EnterpriseSaaSEngine,
  type ProductEntity,
  type CustomerEntity,
  type SupplierEntity,
  type TaxProfileEntity,
  type CategoryEntity,
  type FinancialAccountEntity,
  type PaymentMethodEntity,
  type TenantSettingsEntity,
} from './enterprise-saas.service.ts';

export const SYSTEM_FIXED_LISTS = {
  months: [
    { number: 1, shortName: 'Ene', fullName: 'Enero' },
    { number: 2, shortName: 'Feb', fullName: 'Febrero' },
    { number: 3, shortName: 'Mar', fullName: 'Marzo' },
    { number: 4, shortName: 'Abr', fullName: 'Abril' },
    { number: 5, shortName: 'May', fullName: 'Mayo' },
    { number: 6, shortName: 'Jun', fullName: 'Junio' },
    { number: 7, shortName: 'Jul', fullName: 'Julio' },
    { number: 8, shortName: 'Ago', fullName: 'Agosto' },
    { number: 9, shortName: 'Sep', fullName: 'Septiembre' },
    { number: 10, shortName: 'Oct', fullName: 'Octubre' },
    { number: 11, shortName: 'Nov', fullName: 'Noviembre' },
    { number: 12, shortName: 'Dic', fullName: 'Diciembre' },
  ],
  businessTypes: [
    'Comercio minorista / tienda',
    'Distribuidora / mayorista',
    'Restaurante / cafetería',
    'Ferretería / construcción',
    'Papelería / librería',
    'Farmacia / salud',
    'Belleza / cuidado personal',
    'Servicios profesionales',
    'Taller / reparaciones',
    'Otro',
  ],
  currencies: [
    { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
    { code: 'NIO', name: 'Córdoba nicaragüense', symbol: 'C$' },
    { code: 'MXN', name: 'Peso mexicano', symbol: '$' },
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ],
} as const;

export interface ProductCatalogViewRow extends ProductEntity {
  estimatedGrossMargin: number | null; // I7: =IF(OR($A7="",N($G7)<=0),"",($G7-N($H7))/$G7)
  controlStatus: string;               // M7: "OK" o mensaje de alerta "⚠ ..."
  activeItemIndex: number | null;      // N7: prod_IdxTodos (para lst_SKU)
  activeProductIndex: number | null;   // O7: prod_IdxProd (para lst_SKUprod)
}

export interface CustomerDirectoryViewRow extends CustomerEntity {
  firstPurchaseDate: string | null; // E7: MINIFS(vta_Fecha, ...)
  purchasesCount: number;           // F7: COUNTIFS(vta_Cliente, ..., vta_Primera, 1, ...)
  totalSoldWithTax: number;         // G7: SUMIFS(vta_Total, ...)
  totalCollected: number;           // H7: Ventas Contado + Cobros Crédito
  pendingBalance: number;           // I7: ROUND(G7 - H7, 2)
  lastPurchaseDate: string | null;  // J7: MAXIFS(vta_Fecha, ...)
  controlStatus: string;            // M7: "OK" o "⚠ ..."
  rankingScore: number;             // N7: Excluye "Genérico (mostrador)" y clientes con G7 <= 0
}

export interface SupplierDirectoryViewRow extends SupplierEntity {
  suppliedProductsDescription?: string; // F7
  catalogProductsCount: number;         // G7: =COUNTIF(prod_Prov, $B7)
  totalPurchasedWithTax: number;        // H7: =SUMIFS(comp_Total, ...)
  totalPaid: number;                    // I7: Compras Contado + Pagos Crédito
  pendingBalance: number;               // J7: =ROUND(H7 - I7, 2)
  controlStatus: string;                // L7: "OK" o "⚠ ..."
}

export interface UnitOfMeasureEntity {
  id: string;
  tenantId: string;
  name: string;
  abbreviation?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * Servicio especializado de la Fase 2: Configuración Empresarial y Catálogos Maestros.
 * Envuelve y extiende el motor transaccional para proveer todas las vistas calculadas,
 * validaciones de calidad de datos (`prod_Control`, `cli_Control`, `prv_Control`),
 * listas dinámicas (`lst_SKU` vs `lst_SKUprod`) y sembrado automático de catálogos por defecto.
 */
export class CatalogsAndConfigService {
  private unitsByTenant = new Map<string, UnitOfMeasureEntity[]>();
  private readonly engine: EnterpriseSaaSEngine;

  constructor(engine: EnterpriseSaaSEngine) {
    this.engine = engine;
  }

  /**
   * Inicializa una empresa con todos los parámetros y listas por defecto de la hoja CONFIGURACIÓN
   * (7 categorías de producto, 10 categorías de gasto, 6 métodos de pago, 12 unidades de medida,
   * 2 cuentas financieras y perfil "Sin impuesto").
   */
  public seedDefaultConfigurationForTenant(
    ctx: AuthenticatedTenantContext,
    init: {
      tradeName: string;
      businessType?: string;
      currencyCode?: string;
      operatingYear?: number;
      analysisMonth?: number;
    }
  ): {
    settings: TenantSettingsEntity;
    productCategories: CategoryEntity[];
    expenseCategories: CategoryEntity[];
    paymentMethods: PaymentMethodEntity[];
    unitsOfMeasure: UnitOfMeasureEntity[];
    financialAccounts: FinancialAccountEntity[];
    taxProfiles: TaxProfileEntity[];
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'MANAGE');

    const currencyObj =
      SYSTEM_FIXED_LISTS.currencies.find((c) => c.code === (init.currencyCode ?? 'NIO')) ??
      SYSTEM_FIXED_LISTS.currencies[1];

    const settings = this.engine.initializeTenant(ctx, {
      tradeName: init.tradeName,
      businessType: init.businessType ?? 'Comercio minorista / tienda',
      currencyCode: currencyObj.code,
      currencySymbol: currencyObj.symbol,
      operatingYear: init.operatingYear ?? 2026,
      analysisMonth: init.analysisMonth ?? 11,
    });

    const prodCatNames = [
      'Alimentos',
      'Bebidas',
      'Limpieza',
      'Cuidado personal',
      'Papelería',
      'Otros productos',
      'Servicios',
    ];
    const productCategories = prodCatNames.map((name, idx) =>
      this.engine.createCategory(ctx, {
        id: `${ctx.tenantId}-pcat-${idx + 1}`,
        name,
        type: 'PRODUCT',
      })
    );

    const expCatNames = [
      'Alquiler',
      'Electricidad',
      'Agua',
      'Internet',
      'Transporte',
      'Salarios',
      'Publicidad',
      'Mantenimiento',
      'Comisiones',
      'Otros',
    ];
    const expenseCategories = expCatNames.map((name, idx) =>
      this.engine.createCategory(ctx, {
        id: `${ctx.tenantId}-ecat-${idx + 1}`,
        name,
        type: 'EXPENSE',
      })
    );

    const methodNames = [
      'Efectivo',
      'Transferencia',
      'Tarjeta',
      'Billetera digital',
      'Cheque',
      'Otro',
    ];
    const paymentMethods = methodNames.map((name, idx) =>
      this.engine.createPaymentMethod(ctx, {
        id: `${ctx.tenantId}-pm-${idx + 1}`,
        name,
      })
    );

    const unitNames = [
      'Unidad',
      'Bolsa',
      'Botella',
      'Litro',
      'Libra',
      'Kilogramo',
      'Paquete',
      'Lata',
      'Cartón',
      'Caja',
      'Servicio',
      'Hora',
    ];
    const unitsOfMeasure: UnitOfMeasureEntity[] = unitNames.map((name, idx) => ({
      id: `${ctx.tenantId}-unit-${idx + 1}`,
      tenantId: ctx.tenantId,
      name,
      status: 'ACTIVE',
    }));
    this.unitsByTenant.set(ctx.tenantId, unitsOfMeasure);

    const financialAccounts = [
      this.engine.createFinancialAccount(ctx, {
        id: `${ctx.tenantId}-acc-1`,
        name: 'Caja general',
        type: 'CASH',
        openingBalance: 0,
      }),
      this.engine.createFinancialAccount(ctx, {
        id: `${ctx.tenantId}-acc-2`,
        name: 'Banco principal',
        type: 'BANK',
        openingBalance: 0,
      }),
    ];

    const taxProfiles = [
      this.engine.createTaxProfile(ctx, {
        id: `${ctx.tenantId}-tax-0`,
        name: 'Sin impuesto',
        rate: 0,
      }),
    ];

    return {
      settings,
      productCategories,
      expenseCategories,
      paymentMethods,
      unitsOfMeasure,
      financialAccounts,
      taxProfiles,
    };
  }

  public addUnitOfMeasure(
    ctx: AuthenticatedTenantContext,
    name: string,
    abbreviation?: string
  ): UnitOfMeasureEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'EDIT');
    const current = this.unitsByTenant.get(ctx.tenantId) ?? [];
    if (current.some((u) => u.name.toLowerCase() === name.trim().toLowerCase())) {
      throw new Error(`⚠ La unidad de medida '${name}' ya existe en esta empresa.`);
    }
    const unit: UnitOfMeasureEntity = {
      id: `${ctx.tenantId}-unit-${current.length + 1}`,
      tenantId: ctx.tenantId,
      name: name.trim(),
      abbreviation,
      status: 'ACTIVE',
    };
    current.push(unit);
    this.unitsByTenant.set(ctx.tenantId, current);
    return unit;
  }

  public listUnitsOfMeasure(ctx: AuthenticatedTenantContext): UnitOfMeasureEntity[] {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'products', 'VIEW');
    return this.unitsByTenant.get(ctx.tenantId) ?? [];
  }

  /**
   * Evalúa la vista completa del Catálogo de Productos y Servicios (Hoja 4: PRODUCTOS Y SERVICIOS)
   * incluyendo:
   * - Margen bruto estimado (% sobre ventas): `($G7 - N($H7)) / $G7`
   * - Estado de control (`prod_Control`, col M)
   * - Índices activos para `lst_SKU` (todos los ítems activos) y `lst_SKUprod` (solo productos físicos activos)
   */
  public getProductCatalogView(ctx: AuthenticatedTenantContext): {
    summary: {
      totalRegistered: number;      // A5: =COUNTIF(prod_SKU,"?*")
      productsCount: number;        // C5: =COUNTIF(prod_Tipo,"Producto")
      servicesCount: number;        // E5: =COUNTIF(prod_Tipo,"Servicio")
      controlAlertsCount: number;   // G5: =SUMPRODUCT((prod_Control<>"")*(prod_Control<>"OK"))
    };
    items: ProductCatalogViewRow[];
    lstSKU: string[];               // Todos los SKUs activos (para Ventas y Simulador)
    lstSKUprod: string[];           // Solo los SKUs de tipo Producto activos (para Compras y Ajustes Inv.)
  } {
    const rawProducts = this.engine.listProducts(ctx, ctx.tenantId);

    const skuCounts = new Map<string, number>();
    for (const p of rawProducts) {
      skuCounts.set(p.sku, (skuCounts.get(p.sku) ?? 0) + 1);
    }

    let activeAllCounter = 0;
    let activeProductCounter = 0;
    const lstSKU: string[] = [];
    const lstSKUprod: string[] = [];

    const items: ProductCatalogViewRow[] = rawProducts.map((p) => {
      // Fórmula I7: =IF(OR($A7="",N($G7)<=0),"",($G7-N($H7))/$G7)
      const estimatedGrossMargin =
        p.sku && p.salePrice > 0 ? excelRound((p.salePrice - p.referenceCost) / p.salePrice, 4) : null;

      // Fórmula M7: =IF($A7="","⚠ Falta código",IF(COUNTIF(prod_SKU,$A7)>1,"⚠ Código duplicado",IF(OR($B7="",$E7="",$G7="",$D7=""),"⚠ Datos incompletos",IF(OR(N($G7)<0,N($H7)<0),"⚠ Precio o costo negativo",IF(AND($E7="Producto",$K7=""),"⚠ Falta stock mínimo","OK")))))
      let controlStatus = 'OK';
      if (!p.sku.trim()) {
        controlStatus = '⚠ Falta código';
      } else if ((skuCounts.get(p.sku) ?? 0) > 1) {
        controlStatus = '⚠ Código duplicado';
      } else if (!p.name.trim() || !p.categoryName.trim()) {
        controlStatus = '⚠ Datos incompletos';
      } else if (p.salePrice < 0 || p.referenceCost < 0) {
        controlStatus = '⚠ Precio o costo negativo';
      } else if (p.type === 'PRODUCT' && (p.minimumStock === undefined || p.minimumStock === null || p.minimumStock < 0)) {
        controlStatus = '⚠ Falta stock mínimo';
      }

      let activeItemIndex: number | null = null;
      let activeProductIndex: number | null = null;

      if (p.sku && p.status === 'ACTIVE') {
        activeAllCounter++;
        activeItemIndex = activeAllCounter;
        lstSKU.push(p.sku);

        if (p.type === 'PRODUCT') {
          activeProductCounter++;
          activeProductIndex = activeProductCounter;
          lstSKUprod.push(p.sku);
        }
      }

      return {
        ...p,
        estimatedGrossMargin,
        controlStatus,
        activeItemIndex,
        activeProductIndex,
      };
    });

    const totalRegistered = items.length;
    const productsCount = items.filter((i) => i.type === 'PRODUCT').length;
    const servicesCount = items.filter((i) => i.type === 'SERVICE').length;
    const controlAlertsCount = items.filter((i) => i.controlStatus !== 'OK').length;

    return {
      summary: {
        totalRegistered,
        productsCount,
        servicesCount,
        controlAlertsCount,
      },
      items,
      lstSKU,
      lstSKUprod,
    };
  }

  /**
   * Evalúa el Directorio de Clientes y su historial de compras, cobros, saldos y ranking (Hoja 9: CLIENTES).
   * Reproduce la regla de `cli_Rank` (Col N): excluye del ranking de clientes principales al
   * cliente de tipo `"Genérico (mostrador)"` (`GENERIC`) y a los clientes sin compras.
   */
  public getCustomersDirectoryView(
    ctx: AuthenticatedTenantContext,
    customers: CustomerEntity[],
    sales: Array<{
      customerId: string;
      date: string;
      year: number;
      paymentCondition: 'CASH' | 'CREDIT';
      grandTotal: number;
      status: 'CONFIRMED' | 'VOIDED';
    }>,
    collections: Array<{
      customerId: string;
      date: string;
      year: number;
      amount: number;
    }>
  ): {
    summary: {
      registeredCustomersCount: number;
      totalSoldWithTax: number;
      totalCollected: number;
      totalPendingBalance: number;
    };
    rows: CustomerDirectoryViewRow[];
    topRankedRegisteredCustomers: CustomerDirectoryViewRow[];
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'customers', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;

    const tenantCustomers = customers.filter((c) => c.tenantId === ctx.tenantId);

    const rows: CustomerDirectoryViewRow[] = tenantCustomers.map((c, idx) => {
      const custSales = sales.filter(
        (s) => s.customerId === c.id && s.status === 'CONFIRMED' && s.year === year
      );
      const custCollections = collections.filter((col) => col.customerId === c.id && col.year === year);

      const purchasesCount = custSales.length;
      const dates = custSales.map((s) => s.date).sort();
      const firstPurchaseDate = dates[0] ?? null;
      const lastPurchaseDate = dates[dates.length - 1] ?? null;

      const totalSoldWithTax = custSales.reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);
      const cashSalesCollected = custSales
        .filter((s) => s.paymentCondition === 'CASH')
        .reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);
      const creditCollectionsSum = custCollections.reduce((sum, col) => excelRound(sum + col.amount, 2), 0);

      const totalCollected = excelRound(cashSalesCollected + creditCollectionsSum, 2);
      const pendingBalance = excelRound(totalSoldWithTax - totalCollected, 2);

      const controlStatus = !c.code.trim() || !c.name.trim() ? '⚠ Falta ID o nombre' : 'OK';

      // Fórmula N7 (cli_Rank):
      // =IF(OR($B7="",$L7="Genérico (mostrador)",N($G7)<=0),-1-ROW()/10000,N($G7)+(1000-ROW())/10000000)
      const rowNum = idx + 7;
      const rankingScore =
        !c.name.trim() || c.customerType === 'GENERIC' || totalSoldWithTax <= 0
          ? -1 - rowNum / 10000
          : totalSoldWithTax + (1000 - rowNum) / 10000000;

      return {
        ...c,
        firstPurchaseDate,
        purchasesCount,
        totalSoldWithTax,
        totalCollected,
        pendingBalance,
        lastPurchaseDate,
        controlStatus,
        rankingScore,
      };
    });

    const topRankedRegisteredCustomers = [...rows]
      .filter((r) => r.rankingScore > 0)
      .sort((a, b) => b.rankingScore - a.rankingScore);

    return {
      summary: {
        registeredCustomersCount: rows.length,
        totalSoldWithTax: rows.reduce((s, r) => excelRound(s + r.totalSoldWithTax, 2), 0),
        totalCollected: rows.reduce((s, r) => excelRound(s + r.totalCollected, 2), 0),
        totalPendingBalance: rows.reduce((s, r) => excelRound(s + r.pendingBalance, 2), 0),
      },
      rows,
      topRankedRegisteredCustomers,
    };
  }

  /**
   * Evalúa el Directorio de Proveedores (Hoja 10: PROVEEDORES) incluyendo:
   * - `N.º productos en catálogo`: `=COUNTIF(prod_Prov, $B7)`
   * - `Total comprado (con impuesto)`, `Total pagado` y `Saldo pendiente`.
   */
  public getSuppliersDirectoryView(
    ctx: AuthenticatedTenantContext,
    suppliers: SupplierEntity[],
    purchases: Array<{
      supplierId: string;
      year: number;
      paymentCondition: 'CASH' | 'CREDIT';
      grandTotal: number;
      status: 'CONFIRMED' | 'VOIDED';
    }>,
    payments: Array<{
      supplierId?: string;
      year: number;
      amount: number;
    }>
  ): {
    summary: {
      registeredSuppliersCount: number;
      totalPurchasedWithTax: number;
      totalPaid: number;
      totalPendingBalance: number;
    };
    rows: SupplierDirectoryViewRow[];
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'suppliers', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;

    const tenantProducts = this.engine.listProducts(ctx, ctx.tenantId);
    const tenantSuppliers = suppliers.filter((s) => s.tenantId === ctx.tenantId);

    const rows: SupplierDirectoryViewRow[] = tenantSuppliers.map((sup) => {
      const catalogProductsCount = tenantProducts.filter((p) => p.preferredSupplierId === sup.id).length;
      const supPurchases = purchases.filter(
        (p) => p.supplierId === sup.id && p.status === 'CONFIRMED' && p.year === year
      );
      const supPayments = payments.filter((pay) => pay.supplierId === sup.id && pay.year === year);

      const totalPurchasedWithTax = supPurchases.reduce((sum, p) => excelRound(sum + p.grandTotal, 2), 0);
      const cashPurchasesPaid = supPurchases
        .filter((p) => p.paymentCondition === 'CASH')
        .reduce((sum, p) => excelRound(sum + p.grandTotal, 2), 0);
      const creditPaymentsSum = supPayments.reduce((sum, pay) => excelRound(sum + pay.amount, 2), 0);

      const totalPaid = excelRound(cashPurchasesPaid + creditPaymentsSum, 2);
      const pendingBalance = excelRound(totalPurchasedWithTax - totalPaid, 2);

      const controlStatus = !sup.code.trim() || !sup.name.trim() ? '⚠ Falta ID o nombre' : 'OK';

      return {
        ...sup,
        catalogProductsCount,
        totalPurchasedWithTax,
        totalPaid,
        pendingBalance,
        controlStatus,
      };
    });

    return {
      summary: {
        registeredSuppliersCount: rows.length,
        totalPurchasedWithTax: rows.reduce((s, r) => excelRound(s + r.totalPurchasedWithTax, 2), 0),
        totalPaid: rows.reduce((s, r) => excelRound(s + r.totalPaid, 2), 0),
        totalPendingBalance: rows.reduce((s, r) => excelRound(s + r.pendingBalance, 2), 0),
      },
      rows,
    };
  }
}
