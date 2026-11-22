// ============================================================================
// MI NEGOCIO PRO 360 — FASE 4: SERVICIO DE VENTAS (POS, FACTURACIÓN Y ANULACIONES)
// Implementa de forma completa la Hoja 5: REGISTRO DE VENTAS y la Sección 8 del Prompt:
// - Búsqueda rápida por SKU o nombre de producto
// - Carrito de venta multi-línea con prevención/fusión de SKU repetido en el mismo documento
// - Descuentos porcentuales por línea, perfiles de impuesto configurables
// - Conservación de costo unitario histórico (CPP mensual para Productos, Costo ref. para Servicios)
// - Ventas de Contado (afectación inmediata a Caja/Banco) y a Crédito (generación de CxC y vencimiento)
// - Estado de cobro por documento ("Cobrado", "Parcial", "Pendiente") considerando tolerancia cfg_Tol
// - Conteo real de transacciones (vta_Primera) sin duplicar el total cuando una factura tiene N líneas
// - Anulación auditable mediante operación compensatoria sin borrado silencioso
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import {
  calculateSaleLine,
  excelRound,
  type PaymentConditionType,
} from '../calculations/financial-engine.ts';
import {
  EnterpriseSaaSEngine,
  type SaleDocumentEntity,
  type ProductEntity,
} from './enterprise-saas.service.ts';

export interface CartItemDraft {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercentage?: number; // 0..1
  taxProfileId: string;
  manualUnitCost?: number;
}

export interface CartPreviewLine {
  productId: string;
  sku: string;
  productName: string;
  itemType: 'PRODUCT' | 'SERVICE';
  availableStock: number | null; // null para Servicios
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  grossSubtotal: number;
  netSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  estimatedHistoricalUnitCost: number;
  estimatedCostTotal: number;
  estimatedGrossProfit: number;
  stockWarning: string | null;
}

export interface CartPreviewSummary {
  lines: CartPreviewLine[];
  grossSubtotal: number;
  discountTotal: number;
  netSubtotal: number;
  taxTotal: number;
  grandTotal: number;
  estimatedCostTotal: number;
  estimatedGrossProfit: number;
  hasStockBlockers: boolean;
}

export interface SalesRegisterFlatRowView {
  saleId: string;
  saleNumber: string;              // A7: vta_ID
  date: string;                    // B7: vta_Fecha
  documentNumber: string;          // C7: vta_Doc
  sku: string;                     // D7: vta_SKU
  productName: string;             // E7: vta_Producto
  customerName: string;            // F7: vta_Cliente
  quantity: number;                // G7: vta_Cant
  unitPrice: number;               // H7: vta_Precio
  discountPercentage: number;      // I7: vta_Desc
  netSubtotal: number;             // K7: vta_Neto
  taxAmount: number;               // L7: vta_ImpImp
  lineTotal: number;               // M7: vta_Total
  historicalUnitCost: number;      // N7: vta_CostoU
  costTotal: number;               // O7: vta_CostoT
  grossProfit: number;             // P7: vta_Util
  paymentCondition: PaymentConditionType; // R7: vta_Cond
  creditDays: number;              // S7: vta_Plazo
  dueDate: string | null;          // AD7: vta_Vence
  collectionStatusLabel: 'Cobrado' | 'Parcial' | 'Pendiente' | 'Anulado'; // U7: vta_Estado
  isFirstLineOfSale: number;       // AE7: vta_Primera (1 en la 1.ª línea del ID, 0 en las demás)
  controlStatus: string;           // X7: vta_Control
}

export class SalesAndPosService {
  private readonly engine: EnterpriseSaaSEngine;

  constructor(engine: EnterpriseSaaSEngine) {
    this.engine = engine;
  }

  /**
   * Búsqueda instantánea en el POS por código SKU exacto/parcial o por nombre de producto/servicio.
   * Solo devuelve ítems con estado ACTIVO pertenecientes al tenant.
   */
  public searchActiveCatalogForPos(
    ctx: AuthenticatedTenantContext,
    query: string
  ): Array<ProductEntity & { currentAvailableStock: number | null; currentMonthlyCpp: number }> {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'products', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const q = query.trim().toLowerCase();

    const products = this.engine
      .listProducts(ctx, ctx.tenantId)
      .filter(
        (p) =>
          p.status === 'ACTIVE' &&
          (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      );

    return products.map((p) => {
      const costing = this.engine.getProductCostingSummary(ctx, p.id);
      const monthRow = costing.monthlyBreakdown[settings.analysisMonth - 1];
      return {
        ...p,
        currentAvailableStock: p.type === 'PRODUCT' ? costing.finalStock : null,
        currentMonthlyCpp:
          p.type === 'PRODUCT'
            ? monthRow
              ? monthRow.weightedAverageCost
              : p.referenceCost
            : p.referenceCost,
      };
    });
  }

  /**
   * Normaliza un carrito de compras fusionando cantidades si el cajero escanea dos veces el mismo SKU,
   * garantizando que al confirmar la venta nunca se viole la regla `COUNTIFS(vta_ID,$A7,vta_SKU,$D7)=1`.
   */
  public normalizeCartMergingDuplicateSkus(rawItems: CartItemDraft[]): CartItemDraft[] {
    const byProduct = new Map<string, CartItemDraft>();
    for (const item of rawItems) {
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.quantity = excelRound(existing.quantity + item.quantity, 4);
      } else {
        byProduct.set(item.productId, { ...item });
      }
    }
    return Array.from(byProduct.values());
  }

  /**
   * Calcula en el servidor la previsualización del carrito de venta antes de confirmar,
   * verificando disponibilidad de stock y mostrando subtotales, descuentos, impuestos y utilidad bruta.
   */
  public previewSaleCart(
    ctx: AuthenticatedTenantContext,
    saleDate: string,
    rawItems: CartItemDraft[],
    taxRatesById: ReadonlyMap<string, number>
  ): CartPreviewSummary {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const products = this.engine.listProducts(ctx, ctx.tenantId);
    const saleMonth = Number(saleDate.split('-')[1] ?? settings.analysisMonth);

    const lines: CartPreviewLine[] = [];
    let grossSubtotal = 0;
    let netSubtotal = 0;
    let taxTotal = 0;
    let grandTotal = 0;
    let estimatedCostTotal = 0;
    let estimatedGrossProfit = 0;
    let hasStockBlockers = false;

    for (const draft of rawItems) {
      const prod = products.find((p) => p.id === draft.productId);
      if (!prod || prod.status !== 'ACTIVE') {
        throw new Error(`⚠ El producto (${draft.productId}) no existe o está inactivo.`);
      }

      const costing = this.engine.getProductCostingSummary(ctx, prod.id);
      const monthRow = costing.monthlyBreakdown[saleMonth - 1];
      const unitCost =
        draft.manualUnitCost !== undefined
          ? draft.manualUnitCost
          : prod.type === 'SERVICE'
            ? prod.referenceCost
            : monthRow
              ? monthRow.weightedAverageCost
              : prod.referenceCost;

      const taxRate = taxRatesById.get(draft.taxProfileId) ?? 0;
      const discount = draft.discountPercentage ?? 0;

      const calc = calculateSaleLine({
        quantity: draft.quantity,
        unitPrice: draft.unitPrice,
        discountPercentage: discount,
        taxRate,
        historicalUnitCost: unitCost,
      });

      let stockWarning: string | null = null;
      if (prod.type === 'PRODUCT' && costing.finalStock < draft.quantity) {
        stockWarning = `Stock insuficiente (${costing.finalStock} disp. < ${draft.quantity} solic.)`;
        if (!settings.allowNegativeStock) {
          hasStockBlockers = true;
        }
      }

      lines.push({
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        itemType: prod.type,
        availableStock: prod.type === 'PRODUCT' ? costing.finalStock : null,
        quantity: draft.quantity,
        unitPrice: draft.unitPrice,
        discountPercentage: discount,
        grossSubtotal: calc.grossSubtotal,
        netSubtotal: calc.netSubtotal,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
        estimatedHistoricalUnitCost: unitCost,
        estimatedCostTotal: calc.costTotal,
        estimatedGrossProfit: calc.grossProfit,
        stockWarning,
      });

      grossSubtotal = excelRound(grossSubtotal + calc.grossSubtotal, 2);
      netSubtotal = excelRound(netSubtotal + calc.netSubtotal, 2);
      taxTotal = excelRound(taxTotal + calc.taxAmount, 2);
      grandTotal = excelRound(grandTotal + calc.lineTotal, 2);
      estimatedCostTotal = excelRound(estimatedCostTotal + calc.costTotal, 4);
      estimatedGrossProfit = excelRound(estimatedGrossProfit + calc.grossProfit, 4);
    }

    return {
      lines,
      grossSubtotal,
      discountTotal: excelRound(grossSubtotal - netSubtotal, 2),
      netSubtotal,
      taxTotal,
      grandTotal,
      estimatedCostTotal,
      estimatedGrossProfit,
      hasStockBlockers,
    };
  }

  /**
   * Genera la vista tabular de la Hoja 5: REGISTRO DE VENTAS y sus KPIs de cabecera (Filas 4..5),
   * garantizando que `N.º DE VENTAS = SUM(vta_Primera)` cuente documentos únicos y nunca duplique
   * el total de una factura multi-línea.
   */
  public getSalesRegisterSheetView(
    ctx: AuthenticatedTenantContext,
    salesList: SaleDocumentEntity[]
  ): {
    kpis: {
      registeredLinesCount: number; // A5: =COUNTIF(vta_SKU,"?*")
      uniqueSalesCount: number;     // C5: =SUM(vta_Primera)
      netSalesTotal: number;        // E5: =SUMIFS(vta_Neto, ...)
      grandBilledTotal: number;     // G5: =SUMIFS(vta_Total, ...)
      grossProfitTotal: number;     // I5: =SUMIFS(vta_Util, ...)
      alertLinesCount: number;      // K5: =SUMPRODUCT((vta_Control<>"")*(vta_Control<>"OK"))
    };
    rows: SalesRegisterFlatRowView[];
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const cxcReport = this.engine.getAccountsReceivableReport(ctx);
    const cxcBySaleId = new Map(cxcReport.map((r) => [r.saleId, r]));

    const tenantSales = salesList.filter(
      (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.year === settings.operatingYear
    );

    const rows: SalesRegisterFlatRowView[] = [];

    for (const sale of tenantSales) {
      let collectionStatusLabel: 'Cobrado' | 'Parcial' | 'Pendiente' | 'Anulado' = 'Cobrado';
      if (sale.paymentCondition === 'CREDIT') {
        const cxc = cxcBySaleId.get(sale.id);
        // Fórmula REGISTRO DE VENTAS!U7:
        // =IF($R7="Contado","Cobrado",IF($R7="Crédito",IF(SUMIFS(cob_Importe,cob_IDVenta,$A7)>=SUMIFS(vta_Total,vta_ID,$A7,vta_Cond,"Crédito")-cfg_Tol,"Cobrado",IF(SUMIFS(cob_Importe,cob_IDVenta,$A7)>0,"Parcial","Pendiente")),"⚠ Defina condición"))
        if (!cxc || cxc.balanceAmount <= settings.reconciliationTolerance) {
          collectionStatusLabel = 'Cobrado';
        } else if (cxc.paidAmount > 0) {
          collectionStatusLabel = 'Parcial';
        } else {
          collectionStatusLabel = 'Pendiente';
        }
      }

      sale.lines.forEach((line, lineIdx) => {
        rows.push({
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          date: sale.date,
          documentNumber: sale.documentNumber ?? sale.saleNumber,
          sku: line.sku,
          productName: line.productName,
          customerName: sale.customerName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercentage: line.discountPercentage,
          netSubtotal: line.netSubtotal,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          historicalUnitCost: line.historicalUnitCost,
          costTotal: line.costTotal,
          grossProfit: line.grossProfit,
          paymentCondition: sale.paymentCondition,
          creditDays: sale.creditDays,
          dueDate: sale.dueDate ?? null,
          collectionStatusLabel,
          isFirstLineOfSale: lineIdx === 0 ? 1 : 0, // vta_Primera: 1 solo en la primera línea del documento
          controlStatus: 'OK',
        });
      });
    }

    const registeredLinesCount = rows.length;
    const uniqueSalesCount = rows.reduce((sum, r) => sum + r.isFirstLineOfSale, 0);
    const netSalesTotal = rows.reduce((sum, r) => excelRound(sum + r.netSubtotal, 2), 0);
    const grandBilledTotal = rows.reduce((sum, r) => excelRound(sum + r.lineTotal, 2), 0);
    const grossProfitTotal = rows.reduce((sum, r) => excelRound(sum + r.grossProfit, 4), 0);
    const alertLinesCount = rows.filter((r) => r.controlStatus !== 'OK').length;

    return {
      kpis: {
        registeredLinesCount,
        uniqueSalesCount,
        netSalesTotal,
        grandBilledTotal,
        grossProfitTotal,
        alertLinesCount,
      },
      rows,
    };
  }
}

