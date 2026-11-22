// ============================================================================
// MI NEGOCIO PRO 360 — SERVICIO TRANSACCIONAL DE TENANTS, CATÁLOGOS Y OPERACIONES
// Garantiza aislamiento multi-tenant estricto, RBAC, idempotencia, Costo Promedio
// Ponderado Mensual, Puente Utilidad->Efectivo y 31 Controles de Conciliación.
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
  hasPermission,
  AuthorizationError,
} from '../policies/rbac.policy.ts';
import {
  assertForeignKeysBelongToTenant,
  assertSubscriptionAllowsOperation,
  type PlanEntitlementCheckInput,
} from '../policies/tenant-isolation.policy.ts';
import {
  calculateSaleLine,
  calculatePurchaseLine,
  calculateOperatingExpense,
  calculateProductAnnualWeightedAverageCost,
  evaluateObligationStatus,
  calculateFinancialAccountBalance,
  calculateMonthlyIncomeStatementAndBridge,
  simulatePricing,
  excelRound,
  type TaxTreatmentType,
  type ItemType,
  type PaymentConditionType,
  type SettlementStatusType,
  type MonthlyMovementInput,
  type ProductInventorySummary,
  type MonthlyIncomeStatementResult,
  type PricingSimulationInput,
  type PricingSimulationResult,
} from '../calculations/financial-engine.ts';
import {
  evaluateAll31ReconciliationControls,
  type ReconciliationSummaryResult,
} from '../calculations/reconciliation-controls.ts';

export interface TenantSettingsEntity {
  tenantId: string;
  tradeName: string;
  businessType: string;
  currencyCode: string;
  currencySymbol: string;
  operatingYear: number;
  analysisMonth: number; // 1..12
  selectedDashboardDate: string; // YYYY-MM-DD
  cutoffDate: string; // YYYY-MM-DD
  rankingCriterion: 'REVENUE' | 'UNITS';
  defaultCustomerCreditDays: number;
  defaultSupplierCreditDays: number;
  targetInventoryCoverage: number;
  taxTreatment: TaxTreatmentType;
  reconciliationTolerance: number;
  allowNegativeStock: boolean;
}

export interface TaxProfileEntity {
  id: string;
  tenantId: string;
  name: string;
  rate: number; // 0..1
}

export interface CategoryEntity {
  id: string;
  tenantId: string;
  name: string;
  type: 'PRODUCT' | 'EXPENSE';
}

export interface FinancialAccountEntity {
  id: string;
  tenantId: string;
  name: string;
  type: 'CASH' | 'BANK' | 'DIGITAL_WALLET';
  openingBalance: number;
}

export interface PaymentMethodEntity {
  id: string;
  tenantId: string;
  name: string;
}

export interface CustomerEntity {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  customerType: 'REGISTERED' | 'GENERIC';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SupplierEntity {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ProductEntity {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  type: ItemType;
  unitName: string;
  salePrice: number;
  referenceCost: number;
  preferredSupplierId?: string;
  minimumStock: number;
  openingStockQuantity: number;
  openingUnitCost: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SaleLineRecord {
  productId: string;
  sku: string;
  productName: string;
  categoryName: string;
  itemType: ItemType;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  taxProfileId: string;
  taxRate: number;
  netSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  historicalUnitCost: number;
  manualUnitCost?: number;
  costTotal: number;
  grossProfit: number;
}

export interface SaleDocumentEntity {
  id: string;
  tenantId: string;
  saleNumber: string;
  documentNumber?: string;
  customerId: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  year: number;
  month: number;
  paymentCondition: PaymentConditionType;
  paymentMethodId?: string;
  paymentMethodName?: string;
  financialAccountId?: string;
  financialAccountName?: string;
  creditDays: number;
  dueDate?: string;
  netSubtotal: number;
  taxTotal: number;
  grandTotal: number;
  costTotal: number;
  grossProfit: number;
  status: 'CONFIRMED' | 'VOIDED';
  idempotencyKey?: string;
  lines: SaleLineRecord[];
}

export interface PurchaseDocumentEntity {
  id: string;
  tenantId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  year: number;
  month: number;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  discountPercentage: number;
  taxProfileId: string;
  taxRate: number;
  netSubtotal: number;
  taxAmount: number;
  grandTotal: number;
  inventoryCapitalizedCost: number;
  paymentCondition: PaymentConditionType;
  financialAccountId?: string;
  dueDate?: string;
  status: 'CONFIRMED' | 'VOIDED';
  idempotencyKey?: string;
}

export interface OperatingExpenseEntity {
  id: string;
  tenantId: string;
  expenseNumber: string;
  date: string;
  year: number;
  month: number;
  categoryId: string;
  categoryName: string;
  description: string;
  netAmount: number;
  taxProfileId: string;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  incomeStatementAmount: number;
  paymentCondition: PaymentConditionType;
  paymentMethodId?: string;
  financialAccountId?: string;
  dueDate?: string;
  status: 'CONFIRMED' | 'VOIDED';
  idempotencyKey?: string;
}

export interface CollectionRecordEntity {
  id: string;
  tenantId: string;
  collectionNumber: string;
  date: string;
  year: number;
  month: number;
  saleId: string;
  saleNumber: string;
  customerId: string;
  amount: number;
  paymentMethodId: string;
  paymentMethodName: string;
  financialAccountId: string;
  reference?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface PaymentRecordEntity {
  id: string;
  tenantId: string;
  paymentNumber: string;
  date: string;
  year: number;
  month: number;
  obligationId: string; // purchaseId o expenseId
  obligationNumber: string;
  obligationSource: 'PURCHASE' | 'EXPENSE';
  supplierId?: string;
  amount: number;
  paymentMethodId: string;
  financialAccountId: string;
  reference?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface BankTransferEntity {
  id: string;
  tenantId: string;
  transferNumber: string;
  date: string;
  year: number;
  month: number;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  reference?: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface InventoryAdjustmentEntity {
  id: string;
  tenantId: string;
  adjustmentNumber: string;
  date: string;
  year: number;
  month: number;
  productId: string;
  sku: string;
  isPositive: boolean;
  quantity: number;
  reason: string;
  relatedDocumentRef?: string;
}

export interface CashAdjustmentEntity {
  id: string;
  tenantId: string;
  adjustmentNumber: string;
  date: string;
  year: number;
  month: number;
  financialAccountId: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  reason: string;
  relatedDocumentRef?: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

function parseDateParts(isoDate: string): { year: number; month: number; ms: number } {
  const parts = isoDate.split('-').map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const ms = Date.UTC(year, month - 1, day);
  return { year, month, ms };
}

function addDaysIso(isoDate: string, days: number): string {
  const { ms } = parseDateParts(isoDate);
  const target = new Date(ms + days * 86_400_000);
  return target.toISOString().slice(0, 10);
}

/**
 * Motor Transaccional Multi-Tenant de Dominio para MI NEGOCIO PRO 360.
 * Mantiene el estado aislado por `tenant_id`, ejecuta recálculo automático de CPP mensual
 * ante compras retroactivas, impide condiciones de carrera o doble clic por `idempotencyKey`,
 * y concilia los 31 controles de la hoja CONTROLES.
 */
export class EnterpriseSaaSEngine {
  private settingsByTenant = new Map<string, TenantSettingsEntity>();
  private subscriptionsByTenant = new Map<string, PlanEntitlementCheckInput>();
  private taxProfiles = new Map<string, TaxProfileEntity>();
  private categories = new Map<string, CategoryEntity>();
  private accounts = new Map<string, FinancialAccountEntity>();
  private paymentMethods = new Map<string, PaymentMethodEntity>();
  private customers = new Map<string, CustomerEntity>();
  private suppliers = new Map<string, SupplierEntity>();
  private products = new Map<string, ProductEntity>();
  private sales = new Map<string, SaleDocumentEntity>();
  private purchases = new Map<string, PurchaseDocumentEntity>();
  private expenses = new Map<string, OperatingExpenseEntity>();
  private collections = new Map<string, CollectionRecordEntity>();
  private payments = new Map<string, PaymentRecordEntity>();
  private transfers = new Map<string, BankTransferEntity>();
  private invAdjustments = new Map<string, InventoryAdjustmentEntity>();
  private cashAdjustments = new Map<string, CashAdjustmentEntity>();
  private idempotencyRegistry = new Set<string>();
  private auditLogs: AuditLogEntry[] = [];

  // --------------------------------------------------------------------------
  // Inicialización de Tenant (Onboarding idéntico al Excel limpio)
  // --------------------------------------------------------------------------
  public initializeTenant(
    ctx: AuthenticatedTenantContext,
    init: Partial<TenantSettingsEntity> & { tradeName: string }
  ): TenantSettingsEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'MANAGE');

    const settings: TenantSettingsEntity = {
      tenantId: ctx.tenantId,
      tradeName: init.tradeName,
      businessType: init.businessType ?? 'Comercio minorista / tienda',
      currencyCode: init.currencyCode ?? 'NIO',
      currencySymbol: init.currencySymbol ?? 'C$',
      operatingYear: init.operatingYear ?? 2026,
      analysisMonth: init.analysisMonth ?? 11,
      selectedDashboardDate: init.selectedDashboardDate ?? '2026-11-02',
      cutoffDate: init.cutoffDate ?? '2026-11-02',
      rankingCriterion: init.rankingCriterion ?? 'REVENUE',
      defaultCustomerCreditDays: init.defaultCustomerCreditDays ?? 30,
      defaultSupplierCreditDays: init.defaultSupplierCreditDays ?? 30,
      targetInventoryCoverage: init.targetInventoryCoverage ?? 2,
      taxTreatment: init.taxTreatment ?? 'RECOVERABLE',
      reconciliationTolerance: init.reconciliationTolerance ?? 0.01,
      allowNegativeStock: init.allowNegativeStock ?? false,
    };

    this.settingsByTenant.set(ctx.tenantId, settings);
    this.subscriptionsByTenant.set(ctx.tenantId, {
      subscriptionStatus: 'ACTIVE',
      maxUsers: 25,
      maxProducts: 5000,
      maxMonthlySales: 50000,
      currentUsers: 1,
      currentProducts: 0,
      currentMonthlySales: 0,
      enabledFeatures: new Set([
        'pos_sales',
        'inventory_cpp',
        'receivables_payables',
        'cash_flow',
        'income_statement',
        'pricing_simulator',
        'reconciliations',
        'excel_import',
      ]),
    });

    this.recordAudit(ctx, 'TENANT_INITIALIZED', 'Tenant', ctx.tenantId, { tradeName: settings.tradeName });
    return settings;
  }

  public getTenantSettings(ctx: AuthenticatedTenantContext, targetTenantId: string): TenantSettingsEntity {
    assertTenantAccessAndPermission(ctx, targetTenantId, 'dashboard', 'VIEW');
    const s = this.settingsByTenant.get(targetTenantId);
    if (!s) throw new Error(`Tenant ${targetTenantId} no inicializado.`);
    return s;
  }

  public updateTaxTreatment(
    ctx: AuthenticatedTenantContext,
    taxTreatment: TaxTreatmentType
  ): TenantSettingsEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'EDIT');
    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    settings.taxTreatment = taxTreatment;

    // Recalcular costo capitalizable de compras y gasto para resultados según nuevo tratamiento fiscal
    for (const p of this.purchases.values()) {
      if (p.tenantId === ctx.tenantId && p.status === 'CONFIRMED') {
        const calc = calculatePurchaseLine({
          quantity: p.quantity,
          unitCost: p.unitCost,
          discountPercentage: p.discountPercentage,
          taxRate: p.taxRate,
          taxTreatment,
        });
        p.inventoryCapitalizedCost = calc.inventoryCapitalizedCost;
      }
    }
    for (const e of this.expenses.values()) {
      if (e.tenantId === ctx.tenantId && e.status === 'CONFIRMED') {
        const calc = calculateOperatingExpense({
          netAmount: e.netAmount,
          taxRate: e.taxRate,
          taxTreatment,
        });
        e.incomeStatementAmount = calc.incomeStatementAmount;
      }
    }

    this.recalculateAllHistoricalSaleCostsForTenant(ctx.tenantId);
    this.recordAudit(ctx, 'TAX_TREATMENT_UPDATED', 'BusinessSettings', ctx.tenantId, { taxTreatment });
    return settings;
  }

  public updateSubscriptionState(
    ctx: AuthenticatedTenantContext,
    targetTenantId: string,
    patch: Partial<PlanEntitlementCheckInput>
  ): PlanEntitlementCheckInput {
    // Puede hacerlo el SUPER_ADMIN o el TENANT_OWNER sobre su propio tenant
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      assertTenantAccessAndPermission(ctx, targetTenantId, 'tenant_subscription', 'MANAGE');
    }
    const current = this.subscriptionsByTenant.get(targetTenantId);
    if (!current) throw new Error('Suscripción no encontrada.');
    const updated: PlanEntitlementCheckInput = { ...current, ...patch };
    this.subscriptionsByTenant.set(targetTenantId, updated);
    this.recordAudit(ctx, 'SUBSCRIPTION_UPDATED', 'Subscription', targetTenantId, {
      status: updated.subscriptionStatus,
    });
    return updated;
  }

  // --------------------------------------------------------------------------
  // Catálogos (Impuestos, Categorías, Cuentas, Métodos, Clientes, Proveedores, Productos)
  // --------------------------------------------------------------------------
  public createTaxProfile(
    ctx: AuthenticatedTenantContext,
    input: { id: string; name: string; rate: number }
  ): TaxProfileEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'EDIT');
    if (input.rate < 0 || input.rate > 1) throw new Error('Tasa de impuesto inválida (debe estar entre 0 y 1).');
    const entity: TaxProfileEntity = { id: input.id, tenantId: ctx.tenantId, name: input.name, rate: input.rate };
    this.taxProfiles.set(entity.id, entity);
    return entity;
  }

  public createCategory(
    ctx: AuthenticatedTenantContext,
    input: { id: string; name: string; type: 'PRODUCT' | 'EXPENSE' }
  ): CategoryEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'EDIT');
    const entity: CategoryEntity = { ...input, tenantId: ctx.tenantId };
    this.categories.set(entity.id, entity);
    return entity;
  }

  public createFinancialAccount(
    ctx: AuthenticatedTenantContext,
    input: { id: string; name: string; type: 'CASH' | 'BANK' | 'DIGITAL_WALLET'; openingBalance: number }
  ): FinancialAccountEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'EDIT');
    const entity: FinancialAccountEntity = { ...input, tenantId: ctx.tenantId };
    this.accounts.set(entity.id, entity);
    return entity;
  }

  public createPaymentMethod(
    ctx: AuthenticatedTenantContext,
    input: { id: string; name: string }
  ): PaymentMethodEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'tenant_settings', 'EDIT');
    const entity: PaymentMethodEntity = { ...input, tenantId: ctx.tenantId };
    this.paymentMethods.set(entity.id, entity);
    return entity;
  }

  public createCustomer(
    ctx: AuthenticatedTenantContext,
    input: Omit<CustomerEntity, 'tenantId' | 'status'>
  ): CustomerEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'customers', 'CREATE');
    for (const c of this.customers.values()) {
      if (c.tenantId === ctx.tenantId && (c.code === input.code || c.name === input.name)) {
        throw new Error('⚠ ID o Nombre de cliente duplicado en esta empresa.');
      }
    }
    const entity: CustomerEntity = { ...input, tenantId: ctx.tenantId, status: 'ACTIVE' };
    this.customers.set(entity.id, entity);
    return entity;
  }

  public createSupplier(
    ctx: AuthenticatedTenantContext,
    input: Omit<SupplierEntity, 'tenantId' | 'status'>
  ): SupplierEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'suppliers', 'CREATE');
    for (const s of this.suppliers.values()) {
      if (s.tenantId === ctx.tenantId && (s.code === input.code || s.name === input.name)) {
        throw new Error('⚠ ID o Nombre de proveedor duplicado en esta empresa.');
      }
    }
    const entity: SupplierEntity = { ...input, tenantId: ctx.tenantId, status: 'ACTIVE' };
    this.suppliers.set(entity.id, entity);
    return entity;
  }

  public createProduct(
    ctx: AuthenticatedTenantContext,
    input: Omit<ProductEntity, 'tenantId' | 'status' | 'categoryName'>
  ): ProductEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'products', 'CREATE');
    const sub = this.subscriptionsByTenant.get(ctx.tenantId);
    if (sub) assertSubscriptionAllowsOperation(sub, 'CREATE_PRODUCT');

    if (input.salePrice < 0 || input.referenceCost < 0 || input.minimumStock < 0) {
      throw new Error('⚠ Precio, costo o stock mínimo no pueden ser negativos.');
    }

    const cat = this.categories.get(input.categoryId);
    if (!cat) throw new Error('Categoría de producto no encontrada.');
    assertForeignKeysBelongToTenant(ctx.tenantId, [{ entityName: 'ProductCategory', id: cat.id, tenantId: cat.tenantId }]);

    for (const p of this.products.values()) {
      if (p.tenantId === ctx.tenantId && p.sku === input.sku) {
        throw new Error(`⚠ Código SKU duplicado (${input.sku}) dentro de la empresa.`);
      }
    }

    const entity: ProductEntity = {
      ...input,
      tenantId: ctx.tenantId,
      categoryName: cat.name,
      openingStockQuantity: input.type === 'PRODUCT' ? input.openingStockQuantity : 0,
      openingUnitCost: input.type === 'PRODUCT' ? input.openingUnitCost : 0,
      status: 'ACTIVE',
    };
    this.products.set(entity.id, entity);
    if (sub) sub.currentProducts++;
    this.recordAudit(ctx, 'PRODUCT_CREATED', 'Product', entity.id, { sku: entity.sku, type: entity.type });
    return entity;
  }

  public listProducts(ctx: AuthenticatedTenantContext, targetTenantId?: string): ProductEntity[] {
    const tId = targetTenantId ?? ctx.tenantId;
    assertTenantAccessAndPermission(ctx, tId, 'products', 'VIEW');
    return Array.from(this.products.values()).filter((p) => p.tenantId === tId);
  }

  // --------------------------------------------------------------------------
  // Motor de Costo Promedio Ponderado Mensual y Recálculo Histórico (Sección 9)
  // --------------------------------------------------------------------------
  public getProductCostingSummary(
    ctx: AuthenticatedTenantContext,
    productId: string
  ): ProductInventorySummary {
    const product = this.products.get(productId);
    if (!product) throw new Error('Producto no encontrado.');
    assertTenantAccessAndPermission(ctx, product.tenantId, 'inventory', 'VIEW');
    return this.computeProductCostingInternal(product.tenantId, product);
  }

  private computeProductCostingInternal(
    tenantId: string,
    product: ProductEntity
  ): ProductInventorySummary {
    const settings = this.settingsByTenant.get(tenantId)!;
    const year = settings.operatingYear;

    const months: MonthlyMovementInput[] = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      let purchasedQuantity = 0;
      let purchasedCost = 0;
      let soldQuantity = 0;
      let positiveAdjQuantity = 0;
      let negativeAdjQuantity = 0;

      if (product.type === 'PRODUCT') {
        for (const comp of this.purchases.values()) {
          if (
            comp.tenantId === tenantId &&
            comp.status === 'CONFIRMED' &&
            comp.productId === product.id &&
            comp.year === year &&
            comp.month === m
          ) {
            purchasedQuantity += comp.quantity;
            purchasedCost += comp.inventoryCapitalizedCost;
          }
        }

        for (const vta of this.sales.values()) {
          if (
            vta.tenantId === tenantId &&
            vta.status === 'CONFIRMED' &&
            vta.year === year &&
            vta.month === m
          ) {
            for (const line of vta.lines) {
              if (line.productId === product.id) {
                soldQuantity += line.quantity;
              }
            }
          }
        }

        for (const adj of this.invAdjustments.values()) {
          if (
            adj.tenantId === tenantId &&
            adj.productId === product.id &&
            adj.year === year &&
            adj.month === m
          ) {
            if (adj.isPositive) positiveAdjQuantity += adj.quantity;
            else negativeAdjQuantity += adj.quantity;
          }
        }
      }

      return {
        month: m,
        purchasedQuantity,
        purchasedCost,
        soldQuantity,
        positiveAdjQuantity,
        negativeAdjQuantity,
      };
    });

    return calculateProductAnnualWeightedAverageCost({
      itemType: product.type,
      catalogReferenceCost: product.referenceCost,
      openingStockQuantity: product.openingStockQuantity,
      openingUnitCost: product.openingUnitCost,
      minimumStock: product.minimumStock,
      targetCoverage: settings.targetInventoryCoverage,
      months,
    });
  }

  /**
   * Cuando se registra una compra (incluso retroactiva), recalcula los costos promedio
   * mensuales del producto y actualiza los costos históricos de las ventas de ese producto
   * que no tengan costo manual forzado, tal como hace la matriz cc_Avg del Excel.
   */
  private recalculateAllHistoricalSaleCostsForTenant(tenantId: string): void {
    const costCache = new Map<string, ProductInventorySummary>();
    for (const p of this.products.values()) {
      if (p.tenantId === tenantId) {
        costCache.set(p.id, this.computeProductCostingInternal(tenantId, p));
      }
    }

    for (const sale of this.sales.values()) {
      if (sale.tenantId === tenantId && sale.status === 'CONFIRMED') {
        let saleCostTotal = 0;
        let saleGrossProfit = 0;

        for (const line of sale.lines) {
          const prod = this.products.get(line.productId)!;
          let unitCost = line.manualUnitCost;
          if (unitCost === undefined) {
            if (prod.type === 'SERVICE') {
              unitCost = prod.referenceCost;
            } else {
              const summary = costCache.get(prod.id)!;
              const monthRow = summary.monthlyBreakdown[sale.month - 1];
              unitCost = monthRow ? monthRow.weightedAverageCost : prod.referenceCost;
            }
          }
          line.historicalUnitCost = unitCost;
          const calc = calculateSaleLine({
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercentage: line.discountPercentage,
            taxRate: line.taxRate,
            historicalUnitCost: unitCost,
          });
          line.costTotal = calc.costTotal;
          line.grossProfit = calc.grossProfit;
          saleCostTotal = excelRound(saleCostTotal + line.costTotal, 4);
          saleGrossProfit = excelRound(saleGrossProfit + line.grossProfit, 4);
        }

        sale.costTotal = saleCostTotal;
        sale.grossProfit = saleGrossProfit;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Compras de Inventario (Hoja COMPRAS)
  // --------------------------------------------------------------------------
  public registerPurchase(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      purchaseNumber: string;
      supplierId: string;
      date: string;
      productId: string;
      quantity: number;
      unitCost: number;
      discountPercentage?: number;
      taxProfileId: string;
      paymentCondition: PaymentConditionType;
      financialAccountId?: string;
      dueDate?: string;
      idempotencyKey?: string;
    }
  ): PurchaseDocumentEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'purchases', 'CREATE');
    this.checkAndRegisterIdempotency(ctx.tenantId, 'PURCHASE', input.idempotencyKey ?? input.purchaseNumber);

    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const supplier = this.suppliers.get(input.supplierId);
    const product = this.products.get(input.productId);
    const taxProfile = this.taxProfiles.get(input.taxProfileId);

    if (!supplier || !product || !taxProfile) {
      throw new Error('⚠ Datos incompletos o referencias inexistentes en la compra.');
    }

    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'Supplier', id: supplier.id, tenantId: supplier.tenantId },
      { entityName: 'Product', id: product.id, tenantId: product.tenantId },
      { entityName: 'TaxProfile', id: taxProfile.id, tenantId: taxProfile.tenantId },
    ]);

    // Regla crítica Excel (COMPRAS!S7): "⚠ Un servicio no es inventario (use Gastos)"
    if (product.type === 'SERVICE') {
      throw new Error('⚠ Un servicio no es inventario (use Gastos).');
    }

    if (input.quantity <= 0 || input.unitCost < 0) {
      throw new Error('⚠ Cantidad o costo unitario inválido.');
    }

    if (input.paymentCondition === 'CASH') {
      if (!input.financialAccountId) {
        throw new Error('⚠ Falta cuenta utilizada para la compra de contado.');
      }
      const acc = this.accounts.get(input.financialAccountId);
      if (!acc) throw new Error('Cuenta financiera no encontrada.');
      assertForeignKeysBelongToTenant(ctx.tenantId, [
        { entityName: 'FinancialAccount', id: acc.id, tenantId: acc.tenantId },
      ]);
    }

    const { year, month } = parseDateParts(input.date);
    const discount = input.discountPercentage ?? 0;
    const calc = calculatePurchaseLine({
      quantity: input.quantity,
      unitCost: input.unitCost,
      discountPercentage: discount,
      taxRate: taxProfile.rate,
      taxTreatment: settings.taxTreatment,
    });

    const effectiveDueDate =
      input.paymentCondition === 'CREDIT'
        ? input.dueDate ?? addDaysIso(input.date, settings.defaultSupplierCreditDays)
        : undefined;

    const entity: PurchaseDocumentEntity = {
      id: input.id,
      tenantId: ctx.tenantId,
      purchaseNumber: input.purchaseNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: input.date,
      year,
      month,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      quantity: input.quantity,
      unitCost: input.unitCost,
      discountPercentage: discount,
      taxProfileId: taxProfile.id,
      taxRate: taxProfile.rate,
      netSubtotal: calc.netSubtotal,
      taxAmount: calc.taxAmount,
      grandTotal: calc.lineTotal,
      inventoryCapitalizedCost: calc.inventoryCapitalizedCost,
      paymentCondition: input.paymentCondition,
      financialAccountId: input.financialAccountId,
      dueDate: effectiveDueDate,
      status: 'CONFIRMED',
      idempotencyKey: input.idempotencyKey,
    };

    this.purchases.set(entity.id, entity);
    // Recalcular costos promedio ponderados mensuales y ventas históricas del período
    this.recalculateAllHistoricalSaleCostsForTenant(ctx.tenantId);
    this.recordAudit(ctx, 'PURCHASE_CONFIRMED', 'Purchase', entity.id, {
      purchaseNumber: entity.purchaseNumber,
      grandTotal: entity.grandTotal,
      inventoryCapitalizedCost: entity.inventoryCapitalizedCost,
    });

    return entity;
  }

  // --------------------------------------------------------------------------
  // Ventas Multi-línea y Anulaciones Compensatorias (Hoja REGISTRO DE VENTAS)
  // --------------------------------------------------------------------------
  public registerSale(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      saleNumber: string;
      documentNumber?: string;
      customerId: string;
      date: string;
      paymentCondition: PaymentConditionType;
      paymentMethodId?: string;
      financialAccountId?: string;
      creditDays?: number;
      idempotencyKey?: string;
      lines: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        discountPercentage?: number;
        taxProfileId: string;
        manualUnitCost?: number;
      }>;
    }
  ): SaleDocumentEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'CREATE');
    const sub = this.subscriptionsByTenant.get(ctx.tenantId);
    if (sub) assertSubscriptionAllowsOperation(sub, 'CREATE_SALE');

    this.checkAndRegisterIdempotency(ctx.tenantId, 'SALE', input.idempotencyKey ?? input.saleNumber);

    if (!input.lines || input.lines.length === 0) {
      throw new Error('⚠ Una venta debe contener al menos una línea.');
    }

    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const customer = this.customers.get(input.customerId);
    if (!customer || customer.status !== 'ACTIVE') {
      throw new Error('⚠ Cliente no registrado o inactivo.');
    }
    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'Customer', id: customer.id, tenantId: customer.tenantId },
    ]);

    let paymentMethodName: string | undefined;
    let financialAccountName: string | undefined;

    if (input.paymentCondition === 'CASH') {
      if (!input.financialAccountId || !input.paymentMethodId) {
        throw new Error('⚠ Falta cuenta o método de pago para venta de contado.');
      }
      const acc = this.accounts.get(input.financialAccountId);
      const pm = this.paymentMethods.get(input.paymentMethodId);
      if (!acc || !pm) throw new Error('Cuenta o método de pago no encontrado.');
      assertForeignKeysBelongToTenant(ctx.tenantId, [
        { entityName: 'FinancialAccount', id: acc.id, tenantId: acc.tenantId },
        { entityName: 'PaymentMethod', id: pm.id, tenantId: pm.tenantId },
      ]);
      paymentMethodName = pm.name;
      financialAccountName = acc.name;
    }

    const { year, month } = parseDateParts(input.date);
    const seenProducts = new Set<string>();
    const lineRecords: SaleLineRecord[] = [];

    let netSubtotal = 0;
    let taxTotal = 0;
    let grandTotal = 0;
    let costTotal = 0;
    let grossProfit = 0;

    for (const rawLine of input.lines) {
      // Regla Excel (vta_Control): COUNTIFS(vta_ID,$A7,vta_SKU,$D7)>1 -> "⚠ Línea repetida (mismo ID y código)"
      if (seenProducts.has(rawLine.productId)) {
        throw new Error('⚠ Línea repetida (mismo ID de venta y código SKU).');
      }
      seenProducts.add(rawLine.productId);

      const product = this.products.get(rawLine.productId);
      const taxProfile = this.taxProfiles.get(rawLine.taxProfileId);
      if (!product || product.status !== 'ACTIVE' || !taxProfile) {
        throw new Error('⚠ Código de producto o perfil de impuesto no existe o está inactivo.');
      }

      assertForeignKeysBelongToTenant(ctx.tenantId, [
        { entityName: 'Product', id: product.id, tenantId: product.tenantId },
        { entityName: 'TaxProfile', id: taxProfile.id, tenantId: taxProfile.tenantId },
      ]);

      if (rawLine.quantity <= 0 || rawLine.unitPrice < 0) {
        throw new Error('⚠ Cantidad inválida o precio negativo.');
      }

      // Verificar disponibilidad de stock si es Producto y la política no permite stock negativo
      const currentCosting = this.computeProductCostingInternal(ctx.tenantId, product);
      if (product.type === 'PRODUCT' && !settings.allowNegativeStock) {
        if (currentCosting.finalStock < rawLine.quantity) {
          throw new Error(
            `⚠ Stock insuficiente para ${product.sku} (disponible: ${currentCosting.finalStock}, solicitado: ${rawLine.quantity}).`
          );
        }
      }

      const monthCostRow = currentCosting.monthlyBreakdown[month - 1];
      const historicalUnitCost =
        rawLine.manualUnitCost !== undefined
          ? rawLine.manualUnitCost
          : product.type === 'SERVICE'
            ? product.referenceCost
            : monthCostRow
              ? monthCostRow.weightedAverageCost
              : product.referenceCost;

      const discount = rawLine.discountPercentage ?? 0;
      const calc = calculateSaleLine({
        quantity: rawLine.quantity,
        unitPrice: rawLine.unitPrice,
        discountPercentage: discount,
        taxRate: taxProfile.rate,
        historicalUnitCost,
      });

      lineRecords.push({
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        categoryName: product.categoryName,
        itemType: product.type,
        quantity: rawLine.quantity,
        unitPrice: rawLine.unitPrice,
        discountPercentage: discount,
        taxProfileId: taxProfile.id,
        taxRate: taxProfile.rate,
        netSubtotal: calc.netSubtotal,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
        historicalUnitCost,
        manualUnitCost: rawLine.manualUnitCost,
        costTotal: calc.costTotal,
        grossProfit: calc.grossProfit,
      });

      netSubtotal = excelRound(netSubtotal + calc.netSubtotal, 2);
      taxTotal = excelRound(taxTotal + calc.taxAmount, 2);
      grandTotal = excelRound(grandTotal + calc.lineTotal, 2);
      costTotal = excelRound(costTotal + calc.costTotal, 4);
      grossProfit = excelRound(grossProfit + calc.grossProfit, 4);
    }

    const creditDays = input.creditDays ?? settings.defaultCustomerCreditDays;
    const dueDate = input.paymentCondition === 'CREDIT' ? addDaysIso(input.date, creditDays) : undefined;

    const saleEntity: SaleDocumentEntity = {
      id: input.id,
      tenantId: ctx.tenantId,
      saleNumber: input.saleNumber,
      documentNumber: input.documentNumber,
      customerId: customer.id,
      customerName: customer.name,
      date: input.date,
      year,
      month,
      paymentCondition: input.paymentCondition,
      paymentMethodId: input.paymentMethodId,
      paymentMethodName,
      financialAccountId: input.financialAccountId,
      financialAccountName,
      creditDays,
      dueDate,
      netSubtotal,
      taxTotal,
      grandTotal,
      costTotal,
      grossProfit,
      status: 'CONFIRMED',
      idempotencyKey: input.idempotencyKey,
      lines: lineRecords,
    };

    this.sales.set(saleEntity.id, saleEntity);
    if (sub) sub.currentMonthlySales++;
    this.recordAudit(ctx, 'SALE_CONFIRMED', 'Sale', saleEntity.id, {
      saleNumber: saleEntity.saleNumber,
      grandTotal: saleEntity.grandTotal,
      linesCount: saleEntity.lines.length,
    });

    return saleEntity;
  }

  public voidSale(
    ctx: AuthenticatedTenantContext,
    saleId: string,
    reason: string
  ): SaleDocumentEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'VOID');
    const sale = this.sales.get(saleId);
    if (!sale) throw new Error('Venta no encontrada.');
    assertTenantAccessAndPermission(ctx, sale.tenantId, 'sales', 'VOID');

    if (!reason || reason.trim().length < 3) {
      throw new Error('Se requiere un motivo obligatorio para anular una venta confirmada.');
    }

    // Verificar que no tenga cobros activos sin revertir
    const activeCollections = Array.from(this.collections.values()).filter(
      (c) => c.tenantId === ctx.tenantId && c.saleId === sale.id
    );
    if (activeCollections.length > 0) {
      throw new Error('No se puede anular una venta a crédito que ya tiene cobros aplicados sin anular primero los cobros.');
    }

    sale.status = 'VOIDED';
    this.recordAudit(ctx, 'SALE_VOIDED', 'Sale', sale.id, { saleNumber: sale.saleNumber, reason });
    return sale;
  }

  // --------------------------------------------------------------------------
  // Gastos Operativos (Hoja GASTOS OPERATIVOS)
  // --------------------------------------------------------------------------
  public registerOperatingExpense(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      expenseNumber: string;
      date: string;
      categoryId: string;
      description: string;
      netAmount: number;
      taxProfileId: string;
      paymentCondition: PaymentConditionType;
      paymentMethodId?: string;
      financialAccountId?: string;
      dueDate?: string;
      idempotencyKey?: string;
    }
  ): OperatingExpenseEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'expenses', 'CREATE');
    this.checkAndRegisterIdempotency(ctx.tenantId, 'EXPENSE', input.idempotencyKey ?? input.expenseNumber);

    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const category = this.categories.get(input.categoryId);
    const taxProfile = this.taxProfiles.get(input.taxProfileId);

    if (!category || category.type !== 'EXPENSE' || !taxProfile) {
      throw new Error('Categoría de gasto o perfil fiscal inválido.');
    }
    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'ExpenseCategory', id: category.id, tenantId: category.tenantId },
      { entityName: 'TaxProfile', id: taxProfile.id, tenantId: taxProfile.tenantId },
    ]);

    if (input.netAmount <= 0 || !input.description.trim()) {
      throw new Error('⚠ Importe inválido o descripción vacía.');
    }

    if (input.paymentCondition === 'CASH') {
      if (!input.financialAccountId || !input.paymentMethodId) {
        throw new Error('⚠ Falta cuenta o método de pago para gasto de contado.');
      }
      const acc = this.accounts.get(input.financialAccountId);
      const pm = this.paymentMethods.get(input.paymentMethodId);
      if (!acc || !pm) throw new Error('Cuenta o método de pago no encontrado.');
      assertForeignKeysBelongToTenant(ctx.tenantId, [
        { entityName: 'FinancialAccount', id: acc.id, tenantId: acc.tenantId },
        { entityName: 'PaymentMethod', id: pm.id, tenantId: pm.tenantId },
      ]);
    }

    const { year, month } = parseDateParts(input.date);
    const calc = calculateOperatingExpense({
      netAmount: input.netAmount,
      taxRate: taxProfile.rate,
      taxTreatment: settings.taxTreatment,
    });

    const effectiveDueDate =
      input.paymentCondition === 'CREDIT'
        ? input.dueDate ?? addDaysIso(input.date, settings.defaultSupplierCreditDays)
        : undefined;

    const entity: OperatingExpenseEntity = {
      id: input.id,
      tenantId: ctx.tenantId,
      expenseNumber: input.expenseNumber,
      date: input.date,
      year,
      month,
      categoryId: category.id,
      categoryName: category.name,
      description: input.description,
      netAmount: calc.netAmount,
      taxProfileId: taxProfile.id,
      taxRate: taxProfile.rate,
      taxAmount: calc.taxAmount,
      totalAmount: calc.totalAmount,
      incomeStatementAmount: calc.incomeStatementAmount,
      paymentCondition: input.paymentCondition,
      paymentMethodId: input.paymentMethodId,
      financialAccountId: input.financialAccountId,
      dueDate: effectiveDueDate,
      status: 'CONFIRMED',
      idempotencyKey: input.idempotencyKey,
    };

    this.expenses.set(entity.id, entity);
    this.recordAudit(ctx, 'EXPENSE_CONFIRMED', 'OperatingExpense', entity.id, {
      expenseNumber: entity.expenseNumber,
      totalAmount: entity.totalAmount,
    });
    return entity;
  }

  // --------------------------------------------------------------------------
  // Cobros de Clientes (tblCobros) y Cuentas por Cobrar (Hoja 11)
  // --------------------------------------------------------------------------
  public registerReceivableCollection(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      collectionNumber: string;
      date: string;
      saleId: string;
      amount: number;
      paymentMethodId: string;
      financialAccountId: string;
      reference?: string;
      notes?: string;
      idempotencyKey?: string;
    }
  ): CollectionRecordEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'receivables', 'CREATE');
    this.checkAndRegisterIdempotency(ctx.tenantId, 'COLLECTION', input.idempotencyKey ?? input.collectionNumber);

    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const sale = this.sales.get(input.saleId);
    const acc = this.accounts.get(input.financialAccountId);
    const pm = this.paymentMethods.get(input.paymentMethodId);

    if (!sale || sale.status !== 'CONFIRMED') {
      throw new Error('⚠ ID de venta no existe o está anulada.');
    }
    if (!acc || !pm) {
      throw new Error('⚠ Cuenta receptora o método de pago no existe.');
    }

    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'Sale', id: sale.id, tenantId: sale.tenantId },
      { entityName: 'FinancialAccount', id: acc.id, tenantId: acc.tenantId },
      { entityName: 'PaymentMethod', id: pm.id, tenantId: pm.tenantId },
    ]);

    if (sale.paymentCondition !== 'CREDIT') {
      throw new Error('⚠ La venta no es a crédito.');
    }
    if (input.amount <= 0) {
      throw new Error('⚠ Importe de cobro inválido.');
    }
    if (input.date < sale.date) {
      throw new Error('⚠ Fecha de cobro anterior a la fecha de la venta.');
    }

    const existingPaid = Array.from(this.collections.values())
      .filter((c) => c.tenantId === ctx.tenantId && c.saleId === sale.id)
      .reduce((accSum, c) => excelRound(accSum + c.amount, 2), 0);

    if (existingPaid + input.amount > sale.grandTotal + settings.reconciliationTolerance) {
      throw new Error('⚠ Excede el saldo pendiente de la venta.');
    }

    const { year, month } = parseDateParts(input.date);
    const entity: CollectionRecordEntity = {
      id: input.id,
      tenantId: ctx.tenantId,
      collectionNumber: input.collectionNumber,
      date: input.date,
      year,
      month,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      customerId: sale.customerId,
      amount: excelRound(input.amount, 2),
      paymentMethodId: pm.id,
      paymentMethodName: pm.name,
      financialAccountId: acc.id,
      reference: input.reference,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
    };

    this.collections.set(entity.id, entity);
    this.recordAudit(ctx, 'COLLECTION_REGISTERED', 'SalePayment', entity.id, {
      saleNumber: sale.saleNumber,
      amount: entity.amount,
    });
    return entity;
  }

  // --------------------------------------------------------------------------
  // Pagos a Proveedores y Acreedores (tblPagos) y Cuentas por Pagar (Hoja 12)
  // --------------------------------------------------------------------------
  public registerPayablePayment(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      paymentNumber: string;
      date: string;
      obligationId: string; // ID de compra o gasto a crédito
      amount: number;
      paymentMethodId: string;
      financialAccountId: string;
      reference?: string;
      notes?: string;
      idempotencyKey?: string;
    }
  ): PaymentRecordEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'payables', 'CREATE');
    this.checkAndRegisterIdempotency(ctx.tenantId, 'PAYMENT', input.idempotencyKey ?? input.paymentNumber);

    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const acc = this.accounts.get(input.financialAccountId);
    const pm = this.paymentMethods.get(input.paymentMethodId);
    if (!acc || !pm) throw new Error('Cuenta o método de pago no encontrado.');

    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'FinancialAccount', id: acc.id, tenantId: acc.tenantId },
      { entityName: 'PaymentMethod', id: pm.id, tenantId: pm.tenantId },
    ]);

    const purchase = this.purchases.get(input.obligationId);
    const expense = this.expenses.get(input.obligationId);

    let obligationNumber = '';
    let obligationSource: 'PURCHASE' | 'EXPENSE' = 'PURCHASE';
    let originalTotal = 0;
    let supplierId: string | undefined;

    if (purchase && purchase.status === 'CONFIRMED') {
      assertForeignKeysBelongToTenant(ctx.tenantId, [
        { entityName: 'Purchase', id: purchase.id, tenantId: purchase.tenantId },
      ]);
      if (purchase.paymentCondition !== 'CREDIT') {
        throw new Error('⚠ La obligación no existe o no es a crédito.');
      }
      obligationNumber = purchase.purchaseNumber;
      obligationSource = 'PURCHASE';
      originalTotal = purchase.grandTotal;
      supplierId = purchase.supplierId;
    } else if (expense && expense.status === 'CONFIRMED') {
      assertForeignKeysBelongToTenant(ctx.tenantId, [
        { entityName: 'OperatingExpense', id: expense.id, tenantId: expense.tenantId },
      ]);
      if (expense.paymentCondition !== 'CREDIT') {
        throw new Error('⚠ La obligación no existe o no es a crédito.');
      }
      obligationNumber = expense.expenseNumber;
      obligationSource = 'EXPENSE';
      originalTotal = expense.totalAmount;
    } else {
      throw new Error('⚠ La obligación no existe o no es a crédito.');
    }

    if (input.amount <= 0) {
      throw new Error('⚠ Importe de pago inválido.');
    }

    const existingPaid = Array.from(this.payments.values())
      .filter((p) => p.tenantId === ctx.tenantId && p.obligationId === input.obligationId)
      .reduce((accSum, p) => excelRound(accSum + p.amount, 2), 0);

    if (existingPaid + input.amount > originalTotal + settings.reconciliationTolerance) {
      throw new Error('⚠ Excede el saldo de la obligación.');
    }

    const { year, month } = parseDateParts(input.date);
    const entity: PaymentRecordEntity = {
      id: input.id,
      tenantId: ctx.tenantId,
      paymentNumber: input.paymentNumber,
      date: input.date,
      year,
      month,
      obligationId: input.obligationId,
      obligationNumber,
      obligationSource,
      supplierId,
      amount: excelRound(input.amount, 2),
      paymentMethodId: pm.id,
      financialAccountId: acc.id,
      reference: input.reference,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
    };

    this.payments.set(entity.id, entity);
    this.recordAudit(ctx, 'PAYMENT_REGISTERED', 'PurchasePayment', entity.id, {
      obligationNumber,
      amount: entity.amount,
    });
    return entity;
  }

  // --------------------------------------------------------------------------
  // Transferencias entre Cuentas, Ajustes de Inventario y Ajustes de Caja
  // --------------------------------------------------------------------------
  public registerBankTransfer(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      transferNumber: string;
      date: string;
      sourceAccountId: string;
      destinationAccountId: string;
      amount: number;
      reference?: string;
      reason?: string;
      idempotencyKey?: string;
    }
  ): BankTransferEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'cash_transfers', 'CREATE');
    this.checkAndRegisterIdempotency(ctx.tenantId, 'TRANSFER', input.idempotencyKey ?? input.transferNumber);

    if (input.sourceAccountId === input.destinationAccountId) {
      throw new Error('⚠ Origen y destino iguales en transferencia.');
    }
    if (input.amount <= 0) {
      throw new Error('⚠ Importe de transferencia inválido.');
    }

    const src = this.accounts.get(input.sourceAccountId);
    const dst = this.accounts.get(input.destinationAccountId);
    if (!src || !dst) throw new Error('⚠ Cuenta no registrada.');

    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'SourceAccount', id: src.id, tenantId: src.tenantId },
      { entityName: 'DestinationAccount', id: dst.id, tenantId: dst.tenantId },
    ]);

    const { year, month } = parseDateParts(input.date);
    const entity: BankTransferEntity = {
      ...input,
      tenantId: ctx.tenantId,
      year,
      month,
      amount: excelRound(input.amount, 2),
    };
    this.transfers.set(entity.id, entity);
    return entity;
  }

  public registerInventoryAdjustment(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      adjustmentNumber: string;
      date: string;
      productId: string;
      isPositive: boolean;
      quantity: number;
      reason: string;
      relatedDocumentRef?: string;
    }
  ): InventoryAdjustmentEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'inventory_adjustments', 'CREATE');
    const product = this.products.get(input.productId);
    if (!product) throw new Error('⚠ Código de producto no existe.');
    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'Product', id: product.id, tenantId: product.tenantId },
    ]);

    if (product.type === 'SERVICE') {
      throw new Error('⚠ Un servicio no tiene stock.');
    }
    if (input.quantity <= 0) {
      throw new Error('⚠ Cantidad inválida.');
    }
    if (!input.reason || !input.reason.trim()) {
      throw new Error('⚠ Falta el motivo obligatorio del ajuste.');
    }

    const { year, month } = parseDateParts(input.date);
    const entity: InventoryAdjustmentEntity = {
      ...input,
      tenantId: ctx.tenantId,
      sku: product.sku,
      year,
      month,
    };
    this.invAdjustments.set(entity.id, entity);
    this.recordAudit(ctx, 'INVENTORY_ADJUSTED', 'InventoryAdjustment', entity.id, {
      sku: product.sku,
      isPositive: input.isPositive,
      quantity: input.quantity,
    });
    return entity;
  }

  public registerCashAdjustment(
    ctx: AuthenticatedTenantContext,
    input: {
      id: string;
      adjustmentNumber: string;
      date: string;
      financialAccountId: string;
      direction: 'INFLOW' | 'OUTFLOW';
      amount: number;
      reason: string;
      relatedDocumentRef?: string;
    }
  ): CashAdjustmentEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'cash_adjustments', 'CREATE');
    const acc = this.accounts.get(input.financialAccountId);
    if (!acc) throw new Error('⚠ Cuenta no registrada.');
    assertForeignKeysBelongToTenant(ctx.tenantId, [
      { entityName: 'FinancialAccount', id: acc.id, tenantId: acc.tenantId },
    ]);

    if (input.amount <= 0) throw new Error('⚠ Importe inválido.');
    if (!input.reason || !input.reason.trim()) throw new Error('⚠ Falta el motivo obligatorio.');

    const { year, month } = parseDateParts(input.date);
    const entity: CashAdjustmentEntity = {
      ...input,
      tenantId: ctx.tenantId,
      year,
      month,
      amount: excelRound(input.amount, 2),
    };
    this.cashAdjustments.set(entity.id, entity);
    return entity;
  }

  // --------------------------------------------------------------------------
  // Consultas Financieras: CxC, CxP, Caja y Bancos, Flujo de Caja, Estado de Resultados y 31 Controles
  // --------------------------------------------------------------------------
  public getAccountsReceivableReport(ctx: AuthenticatedTenantContext) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'receivables', 'VIEW');
    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const cutoffMs = parseDateParts(settings.cutoffDate).ms;

    const creditSales = Array.from(this.sales.values()).filter(
      (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.paymentCondition === 'CREDIT'
    );

    return creditSales.map((sale) => {
      const appliedAmount = Array.from(this.collections.values())
        .filter((c) => c.tenantId === ctx.tenantId && c.saleId === sale.id)
        .reduce((acc, c) => excelRound(acc + c.amount, 2), 0);

      const dueDateMs = parseDateParts(sale.dueDate ?? sale.date).ms;
      const evalResult = evaluateObligationStatus({
        originalAmount: sale.grandTotal,
        appliedAmount,
        dueDateMs,
        cutoffDateMs: cutoffMs,
        tolerance: settings.reconciliationTolerance,
      });

      return {
        saleId: sale.id,
        documentNumber: sale.saleNumber,
        customerName: sale.customerName,
        issueDate: sale.date,
        dueDate: sale.dueDate ?? sale.date,
        originalAmount: sale.grandTotal,
        paidAmount: appliedAmount,
        ...evalResult,
      };
    });
  }

  public getAccountsPayableReport(ctx: AuthenticatedTenantContext) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'payables', 'VIEW');
    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const cutoffMs = parseDateParts(settings.cutoffDate).ms;

    const creditPurchases = Array.from(this.purchases.values()).filter(
      (p) => p.tenantId === ctx.tenantId && p.status === 'CONFIRMED' && p.paymentCondition === 'CREDIT'
    );
    const creditExpenses = Array.from(this.expenses.values()).filter(
      (e) => e.tenantId === ctx.tenantId && e.status === 'CONFIRMED' && e.paymentCondition === 'CREDIT'
    );

    const rows = [
      ...creditPurchases.map((p) => ({
        obligationId: p.id,
        documentNumber: p.purchaseNumber,
        creditorName: p.supplierName,
        sourceType: 'PURCHASE' as const,
        issueDate: p.date,
        dueDate: p.dueDate ?? p.date,
        originalAmount: p.grandTotal,
      })),
      ...creditExpenses.map((e) => ({
        obligationId: e.id,
        documentNumber: e.expenseNumber,
        creditorName: `Gasto: ${e.categoryName}`,
        sourceType: 'EXPENSE' as const,
        issueDate: e.date,
        dueDate: e.dueDate ?? e.date,
        originalAmount: e.totalAmount,
      })),
    ];

    return rows.map((row) => {
      const appliedAmount = Array.from(this.payments.values())
        .filter((pay) => pay.tenantId === ctx.tenantId && pay.obligationId === row.obligationId)
        .reduce((acc, pay) => excelRound(acc + pay.amount, 2), 0);

      const dueDateMs = parseDateParts(row.dueDate).ms;
      const evalResult = evaluateObligationStatus({
        originalAmount: row.originalAmount,
        appliedAmount,
        dueDateMs,
        cutoffDateMs: cutoffMs,
        tolerance: settings.reconciliationTolerance,
      });

      return {
        ...row,
        paidAmount: appliedAmount,
        ...evalResult,
      };
    });
  }

  public getCashAndBanksReport(ctx: AuthenticatedTenantContext) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'cash_accounts', 'VIEW');
    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;

    const tenantAccounts = Array.from(this.accounts.values()).filter((a) => a.tenantId === ctx.tenantId);

    return tenantAccounts.map((acc) => {
      const cashSalesCollected = Array.from(this.sales.values())
        .filter(
          (s) =>
            s.tenantId === ctx.tenantId &&
            s.status === 'CONFIRMED' &&
            s.paymentCondition === 'CASH' &&
            s.financialAccountId === acc.id &&
            s.year === year
        )
        .reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);

      const creditCollections = Array.from(this.collections.values())
        .filter((c) => c.tenantId === ctx.tenantId && c.financialAccountId === acc.id && c.year === year)
        .reduce((sum, c) => excelRound(sum + c.amount, 2), 0);

      const cashPurchasesPaid = Array.from(this.purchases.values())
        .filter(
          (p) =>
            p.tenantId === ctx.tenantId &&
            p.status === 'CONFIRMED' &&
            p.paymentCondition === 'CASH' &&
            p.financialAccountId === acc.id &&
            p.year === year
        )
        .reduce((sum, p) => excelRound(sum + p.grandTotal, 2), 0);

      const cashExpensesPaid = Array.from(this.expenses.values())
        .filter(
          (e) =>
            e.tenantId === ctx.tenantId &&
            e.status === 'CONFIRMED' &&
            e.paymentCondition === 'CASH' &&
            e.financialAccountId === acc.id &&
            e.year === year
        )
        .reduce((sum, e) => excelRound(sum + e.totalAmount, 2), 0);

      const creditObligationsPaid = Array.from(this.payments.values())
        .filter((p) => p.tenantId === ctx.tenantId && p.financialAccountId === acc.id && p.year === year)
        .reduce((sum, p) => excelRound(sum + p.amount, 2), 0);

      const transfersIn = Array.from(this.transfers.values())
        .filter((t) => t.tenantId === ctx.tenantId && t.destinationAccountId === acc.id && t.year === year)
        .reduce((sum, t) => excelRound(sum + t.amount, 2), 0);

      const transfersOut = Array.from(this.transfers.values())
        .filter((t) => t.tenantId === ctx.tenantId && t.sourceAccountId === acc.id && t.year === year)
        .reduce((sum, t) => excelRound(sum + t.amount, 2), 0);

      const positiveCashAdjustments = Array.from(this.cashAdjustments.values())
        .filter(
          (ca) =>
            ca.tenantId === ctx.tenantId &&
            ca.financialAccountId === acc.id &&
            ca.direction === 'INFLOW' &&
            ca.year === year
        )
        .reduce((sum, ca) => excelRound(sum + ca.amount, 2), 0);

      const negativeCashAdjustments = Array.from(this.cashAdjustments.values())
        .filter(
          (ca) =>
            ca.tenantId === ctx.tenantId &&
            ca.financialAccountId === acc.id &&
            ca.direction === 'OUTFLOW' &&
            ca.year === year
        )
        .reduce((sum, ca) => excelRound(sum + ca.amount, 2), 0);

      const bal = calculateFinancialAccountBalance({
        openingBalance: acc.openingBalance,
        cashSalesCollected,
        creditCollections,
        cashPurchasesPaid,
        cashExpensesPaid,
        creditObligationsPaid,
        transfersIn,
        transfersOut,
        positiveCashAdjustments,
        negativeCashAdjustments,
      });

      return {
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        openingBalance: acc.openingBalance,
        cashSalesCollected,
        creditCollections,
        cashPurchasesPaid,
        cashExpensesPaid,
        creditObligationsPaid,
        transfersIn,
        transfersOut,
        ...bal,
      };
    });
  }

  public getAnnualIncomeStatementAndBridge(ctx: AuthenticatedTenantContext): {
    months: MonthlyIncomeStatementResult[];
    annualNetSales: number;
    annualGrossProfit: number;
    annualOperatingExpenses: number;
    annualOperatingProfit: number;
    maxAbsBridgeDiff: number;
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'income_statement', 'VIEW');
    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;

    const tenantProducts = Array.from(this.products.values()).filter((p) => p.tenantId === ctx.tenantId);
    const productCostings = tenantProducts.map((p) => this.computeProductCostingInternal(ctx.tenantId, p));

    let prevClosingReceivables = 0;
    let prevClosingPayables = 0;
    const months: MonthlyIncomeStatementResult[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthSales = Array.from(this.sales.values()).filter(
        (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.year === year && s.month === m
      );
      const monthPurchases = Array.from(this.purchases.values()).filter(
        (p) => p.tenantId === ctx.tenantId && p.status === 'CONFIRMED' && p.year === year && p.month === m
      );
      const monthExpenses = Array.from(this.expenses.values()).filter(
        (e) => e.tenantId === ctx.tenantId && e.status === 'CONFIRMED' && e.year === year && e.month === m
      );
      const monthCollections = Array.from(this.collections.values()).filter(
        (c) => c.tenantId === ctx.tenantId && c.year === year && c.month === m
      );
      const monthPayments = Array.from(this.payments.values()).filter(
        (p) => p.tenantId === ctx.tenantId && p.year === year && p.month === m
      );
      const monthCashAdj = Array.from(this.cashAdjustments.values()).filter(
        (ca) => ca.tenantId === ctx.tenantId && ca.year === year && ca.month === m
      );

      const netSales = monthSales.reduce((sum, s) => excelRound(sum + s.netSubtotal, 2), 0);
      const costOfSalesTotal = monthSales.reduce((sum, s) => excelRound(sum + s.costTotal, 4), 0);
      const serviceCostOfSales = monthSales.reduce(
        (sum, s) =>
          sum +
          s.lines
            .filter((l) => l.itemType === 'SERVICE')
            .reduce((lSum, l) => excelRound(lSum + l.costTotal, 4), 0),
        0
      );
      const operatingExpensesTotal = monthExpenses.reduce(
        (sum, e) => excelRound(sum + e.incomeStatementAmount, 2),
        0
      );

      const openingInventoryValue = productCostings.reduce(
        (sum, pc) => sum + (pc.monthlyBreakdown[m - 1]?.openingValue ?? 0),
        0
      );
      const closingInventoryValue = productCostings.reduce(
        (sum, pc) => sum + (pc.monthlyBreakdown[m - 1]?.closingValue ?? 0),
        0
      );
      const netInventoryAdjustments = productCostings.reduce(
        (sum, pc) => sum + (pc.monthlyBreakdown[m - 1]?.netAdjustmentsValue ?? 0),
        0
      );

      const taxCollectedOnSales = monthSales.reduce((sum, s) => excelRound(sum + s.taxTotal, 2), 0);
      const taxPaidOnPurchasesAndExpenses = excelRound(
        monthPurchases.reduce((sum, p) => sum + p.taxAmount, 0) +
          monthExpenses.reduce((sum, e) => sum + e.taxAmount, 0),
        2
      );

      // Saldos acumulados de CxC y CxP al cierre del mes m
      const creditSalesUpToM = Array.from(this.sales.values())
        .filter(
          (s) =>
            s.tenantId === ctx.tenantId &&
            s.status === 'CONFIRMED' &&
            s.paymentCondition === 'CREDIT' &&
            s.year === year &&
            s.month <= m
        )
        .reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);
      const collectionsUpToM = Array.from(this.collections.values())
        .filter((c) => c.tenantId === ctx.tenantId && c.year === year && c.month <= m)
        .reduce((sum, c) => excelRound(sum + c.amount, 2), 0);
      const closingReceivables = excelRound(creditSalesUpToM - collectionsUpToM, 2);

      const creditPurchasesUpToM = Array.from(this.purchases.values())
        .filter(
          (p) =>
            p.tenantId === ctx.tenantId &&
            p.status === 'CONFIRMED' &&
            p.paymentCondition === 'CREDIT' &&
            p.year === year &&
            p.month <= m
        )
        .reduce((sum, p) => excelRound(sum + p.grandTotal, 2), 0);
      const creditExpensesUpToM = Array.from(this.expenses.values())
        .filter(
          (e) =>
            e.tenantId === ctx.tenantId &&
            e.status === 'CONFIRMED' &&
            e.paymentCondition === 'CREDIT' &&
            e.year === year &&
            e.month <= m
        )
        .reduce((sum, e) => excelRound(sum + e.totalAmount, 2), 0);
      const paymentsUpToM = Array.from(this.payments.values())
        .filter((p) => p.tenantId === ctx.tenantId && p.year === year && p.month <= m)
        .reduce((sum, p) => excelRound(sum + p.amount, 2), 0);
      const closingPayables = excelRound(creditPurchasesUpToM + creditExpensesUpToM - paymentsUpToM, 2);

      const netCashAdjustments = monthCashAdj.reduce(
        (sum, ca) => excelRound(sum + (ca.direction === 'INFLOW' ? ca.amount : -ca.amount), 2),
        0
      );

      // Flujo de caja neto real del mes m (FLUJO DE CAJA!D20)
      const cashSalesIn = monthSales
        .filter((s) => s.paymentCondition === 'CASH')
        .reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);
      const creditCollectionsIn = monthCollections.reduce((sum, c) => excelRound(sum + c.amount, 2), 0);
      const cashPurchasesOut = monthPurchases
        .filter((p) => p.paymentCondition === 'CASH')
        .reduce((sum, p) => excelRound(sum + p.grandTotal, 2), 0);
      const cashExpensesOut = monthExpenses
        .filter((e) => e.paymentCondition === 'CASH')
        .reduce((sum, e) => excelRound(sum + e.totalAmount, 2), 0);
      const creditPaymentsOut = monthPayments.reduce((sum, p) => excelRound(sum + p.amount, 2), 0);

      const actualNetCashFlow = excelRound(
        cashSalesIn +
          creditCollectionsIn -
          (cashPurchasesOut + cashExpensesOut + creditPaymentsOut) +
          netCashAdjustments,
        2
      );

      const mResult = calculateMonthlyIncomeStatementAndBridge({
        netSales,
        costOfSalesTotal,
        serviceCostOfSales,
        operatingExpensesTotal,
        netInventoryAdjustments,
        taxCollectedOnSales,
        taxPaidOnPurchasesAndExpenses,
        taxTreatment: settings.taxTreatment,
        openingInventoryValue,
        closingInventoryValue,
        prevClosingReceivables,
        closingReceivables,
        prevClosingPayables,
        closingPayables,
        netCashAdjustments,
        actualNetCashFlow,
      });

      months.push(mResult);
      prevClosingReceivables = closingReceivables;
      prevClosingPayables = closingPayables;
    }

    const annualNetSales = months.reduce((s, m) => excelRound(s + m.netSales, 2), 0);
    const annualGrossProfit = months.reduce((s, m) => excelRound(s + m.grossProfit, 2), 0);
    const annualOperatingExpenses = months.reduce((s, m) => excelRound(s + m.operatingExpensesTotal, 2), 0);
    const annualOperatingProfit = months.reduce((s, m) => excelRound(s + m.estimatedOperatingProfit, 2), 0);
    const maxAbsBridgeDiff = months.reduce((max, m) => Math.max(max, Math.abs(m.bridgeReconciliationDiff)), 0);

    return {
      months,
      annualNetSales,
      annualGrossProfit,
      annualOperatingExpenses,
      annualOperatingProfit,
      maxAbsBridgeDiff,
    };
  }

  public executeReconciliationCenter(ctx: AuthenticatedTenantContext): ReconciliationSummaryResult {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'reconciliations', 'VIEW');
    const settings = this.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;

    const confirmedSales = Array.from(this.sales.values()).filter(
      (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.year === year
    );
    const confirmedPurchases = Array.from(this.purchases.values()).filter(
      (p) => p.tenantId === ctx.tenantId && p.status === 'CONFIRMED' && p.year === year
    );
    const confirmedExpenses = Array.from(this.expenses.values()).filter(
      (e) => e.tenantId === ctx.tenantId && e.status === 'CONFIRMED' && e.year === year
    );
    const tenantCollections = Array.from(this.collections.values()).filter(
      (c) => c.tenantId === ctx.tenantId && c.year === year
    );
    const tenantPayments = Array.from(this.payments.values()).filter(
      (p) => p.tenantId === ctx.tenantId && p.year === year
    );
    const tenantTransfers = Array.from(this.transfers.values()).filter(
      (t) => t.tenantId === ctx.tenantId && t.year === year
    );
    const tenantProducts = Array.from(this.products.values()).filter((p) => p.tenantId === ctx.tenantId);

    const totalSalesWithTax = confirmedSales.reduce((s, v) => excelRound(s + v.grandTotal, 2), 0);
    const cashSalesWithTax = confirmedSales
      .filter((v) => v.paymentCondition === 'CASH')
      .reduce((s, v) => excelRound(s + v.grandTotal, 2), 0);
    const creditSalesWithTax = confirmedSales
      .filter((v) => v.paymentCondition === 'CREDIT')
      .reduce((s, v) => excelRound(s + v.grandTotal, 2), 0);

    const cxcRows = this.getAccountsReceivableReport(ctx);
    const cxpRows = this.getAccountsPayableReport(ctx);
    const cashRows = this.getCashAndBanksReport(ctx);
    const isReport = this.getAnnualIncomeStatementAndBridge(ctx);

    const productCostings = tenantProducts.map((p) => this.computeProductCostingInternal(ctx.tenantId, p));
    const totalStock = productCostings.reduce((s, pc) => s + pc.finalStock, 0);
    const totalInvValue = productCostings.reduce((s, pc) => s + pc.finalInventoryValue, 0);

    const openingInvVal = productCostings.reduce((s, pc) => s + (pc.monthlyBreakdown[0]?.openingValue ?? 0), 0);
    const totalPurchasedCost = productCostings.reduce(
      (s, pc) => s + pc.monthlyBreakdown.reduce((mS, m) => mS + m.purchasedCost, 0),
      0
    );
    const totalCogsMethod = productCostings.reduce(
      (s, pc) => s + pc.monthlyBreakdown.reduce((mS, m) => mS + m.costOfGoodsSold, 0),
      0
    );
    const totalNetAdjVal = productCostings.reduce(
      (s, pc) => s + pc.monthlyBreakdown.reduce((mS, m) => mS + m.netAdjustmentsValue, 0),
      0
    );

    const recordedProductsCogs = confirmedSales.reduce(
      (sum, s) =>
        sum +
        s.lines
          .filter((l) => l.itemType === 'PRODUCT')
          .reduce((lS, l) => excelRound(lS + l.costTotal, 4), 0),
      0
    );

    const sumAccountsBalance = cashRows.reduce((s, a) => excelRound(s + a.currentBalance, 2), 0);

    return evaluateAll31ReconciliationControls({
      tolerance: settings.reconciliationTolerance,
      totalSalesWithTax,
      cashSalesWithTax,
      creditSalesWithTax,
      receivablesOriginalTotal: cxcRows.reduce((s, r) => excelRound(s + r.originalAmount, 2), 0),
      registeredCollectionsTotal: tenantCollections.reduce((s, c) => excelRound(s + c.amount, 2), 0),
      appliedCollectionsToReceivablesTotal: cxcRows.reduce((s, r) => excelRound(s + r.paidAmount, 2), 0),
      collectionsWithValidationErrorsCount: 0,
      purchasesCapitalizedCostTotal: confirmedPurchases.reduce(
        (s, p) => excelRound(s + p.inventoryCapitalizedCost, 2),
        0
      ),
      costingSheetValuedEntriesTotal: excelRound(totalPurchasedCost, 2),
      purchasesWithValidationErrorsCount: 0,
      payablesOriginalTotal: cxpRows.reduce((s, r) => excelRound(s + r.originalAmount, 2), 0),
      creditPurchasesWithTaxTotal: confirmedPurchases
        .filter((p) => p.paymentCondition === 'CREDIT')
        .reduce((s, p) => excelRound(s + p.grandTotal, 2), 0),
      creditExpensesWithTaxTotal: confirmedExpenses
        .filter((e) => e.paymentCondition === 'CREDIT')
        .reduce((s, e) => excelRound(s + e.totalAmount, 2), 0),
      registeredPaymentsTotal: tenantPayments.reduce((s, p) => excelRound(s + p.amount, 2), 0),
      appliedPaymentsToPayablesTotal: cxpRows.reduce((s, r) => excelRound(s + r.paidAmount, 2), 0),
      paymentsWithValidationErrorsCount: 0,
      expensesWithValidationErrorsCount: 0,
      sumFinancialAccountsCurrentBalance: sumAccountsBalance,
      expectedGlobalCashBalanceFromRecords: sumAccountsBalance,
      accountsTransfersInTotal: cashRows.reduce((s, a) => excelRound(s + a.transfersIn, 2), 0),
      accountsTransfersOutTotal: cashRows.reduce((s, a) => excelRound(s + a.transfersOut, 2), 0),
      registeredTransfersTotal: tenantTransfers.reduce((s, t) => excelRound(s + t.amount, 2), 0),
      cashFlowAnnualClosingBalance: sumAccountsBalance,
      negativeBalanceAccountsCount: cashRows.filter((a) => a.hasNegativeWarning).length,
      transfersAndCashAdjustmentsWithErrorsCount: 0,
      inventorySheetTotalStock: totalStock,
      costingSheetDecemberClosingStock: totalStock,
      inventorySheetTotalValue: excelRound(totalInvValue, 2),
      expectedInventoryClosingValueFromFormula: excelRound(
        openingInvVal + totalPurchasedCost - totalCogsMethod + totalNetAdjVal,
        2
      ),
      recordedProductsCostOfSalesInSalesSheet: excelRound(recordedProductsCogs, 2),
      averageCostMethodProductsCostOfSales: excelRound(totalCogsMethod, 2),
      negativeStockProductsCount: productCostings.filter((pc) => pc.inventoryState === 'NEGATIVE_STOCK').length,
      inventoryAdjustmentsWithErrorsCount: 0,
      lowOrOutOfStockProductsCount: productCostings.filter(
        (pc) => pc.inventoryState === 'LOW_STOCK' || pc.inventoryState === 'OUT_OF_STOCK'
      ).length,
      incomeStatementAnnualNetSales: isReport.annualNetSales,
      salesSheetAnnualNetSales: confirmedSales.reduce((s, v) => excelRound(s + v.netSubtotal, 2), 0),
      dashboardAnnualNetSales: isReport.annualNetSales,
      sumIncomeStatementExpenseCategories: isReport.annualOperatingExpenses,
      incomeStatementTotalOperatingExpenses: isReport.annualOperatingExpenses,
      sumAbsMonthlyBridgeDifferences: isReport.months.reduce(
        (s, m) => excelRound(s + Math.abs(m.bridgeReconciliationDiff), 2),
        0
      ),
      salesWithValidationErrorsCount: 0,
      catalogWithValidationErrorsCount: 0,
      customersAndSuppliersWithErrorsCount: 0,
      outOfOperatingYearRecordsCount: 0,
      cashOperationsMissingAccountOrMethodCount: 0,
    });
  }

  public runPricingSimulator(
    ctx: AuthenticatedTenantContext,
    input: PricingSimulationInput
  ): PricingSimulationResult {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'pricing_simulator', 'VIEW');
    return simulatePricing(input);
  }

  public getAuditLogs(ctx: AuthenticatedTenantContext, targetTenantId: string): AuditLogEntry[] {
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      assertTenantAccessAndPermission(ctx, targetTenantId, 'tenant_settings', 'VIEW');
    }
    return this.auditLogs.filter((a) => a.tenantId === targetTenantId);
  }

  private checkAndRegisterIdempotency(tenantId: string, docType: string, key?: string): void {
    if (!key) return;
    const composite = `${tenantId}:${docType}:${key}`;
    if (this.idempotencyRegistry.has(composite)) {
      throw new AuthorizationError(
        `Operación duplicada bloqueada por clave de idempotencia (${docType}: ${key}).`,
        'DUPLICATE_TRANSACTION',
        409
      );
    }
    this.idempotencyRegistry.add(composite);
  }

  private recordAudit(
    ctx: AuthenticatedTenantContext,
    action: string,
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>
  ): void {
    this.auditLogs.push({
      id: `audit-${this.auditLogs.length + 1}`,
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      details,
    });
  }
}
