import { prisma } from '@/infrastructure/database/prisma-client';
import { excelRound } from '@/domain/calculations/financial-engine';
import { type AuthenticatedTenantContext, assertTenantAccessAndPermission } from '@/domain/policies/rbac.policy';

export interface RegisterExpenseInput {
  categoryId: string;
  taxProfileId: string;
  date: string;
  description: string;
  netAmount: number;
  paymentCondition: 'CASH' | 'CREDIT';
  paymentMethodId?: string | null;
  financialAccountId?: string | null;
  receiptNumber?: string | null;
  idempotencyKey?: string | null;
}

export interface RegisterReceivablePaymentInput {
  accountReceivableId: string;
  date: string;
  amount: number;
  paymentMethodId: string;
  financialAccountId: string;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface RegisterPayablePaymentInput {
  accountPayableId: string;
  date: string;
  amount: number;
  paymentMethodId: string;
  financialAccountId: string;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface TransferFundsInput {
  sourceAccountId: string;
  destinationAccountId: string;
  date: string;
  amount: number;
  reference?: string | null;
  reason?: string | null;
}

export interface RegisterCashAdjustmentInput {
  financialAccountId: string;
  date: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  reason: string;
  relatedDocumentRef?: string | null;
}

export class FinancePostgresService {
  public async registerExpense(ctx: AuthenticatedTenantContext, input: RegisterExpenseInput) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'expenses', 'CREATE');

    if (input.netAmount <= 0) {
      throw new Error('El importe del gasto debe ser mayor a cero.');
    }
    if (!input.description.trim()) {
      throw new Error('La descripción del gasto es obligatoria.');
    }
    if (input.paymentCondition === 'CASH' && (!input.paymentMethodId || !input.financialAccountId)) {
      throw new Error('Los gastos de contado requieren método de pago y cuenta financiera.');
    }

    return prisma.$transaction(
      async (tx) => {
        if (input.idempotencyKey) {
          const existing = await tx.operatingExpense.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: ctx.tenantId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing) return existing;
        }

        const [category, taxProfile, settings, creditSettings] = await Promise.all([
          tx.expenseCategory.findFirst({ where: { id: input.categoryId, tenantId: ctx.tenantId } }),
          tx.taxProfile.findFirst({ where: { id: input.taxProfileId, tenantId: ctx.tenantId } }),
          tx.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
          tx.creditSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
        ]);

        if (!category) throw new Error('Categoría de gasto no encontrada en esta empresa.');
        if (!taxProfile) throw new Error('Perfil de impuesto no encontrado en esta empresa.');

        if (input.paymentMethodId) {
          const pm = await tx.paymentMethod.findFirst({
            where: { id: input.paymentMethodId, tenantId: ctx.tenantId },
          });
          if (!pm) throw new Error('Método de pago no encontrado en esta empresa.');
        }
        if (input.financialAccountId) {
          const fa = await tx.financialAccount.findFirst({
            where: { id: input.financialAccountId, tenantId: ctx.tenantId },
          });
          if (!fa) throw new Error('Cuenta financiera no encontrada en esta empresa.');
        }

        const date = new Date(input.date + 'T00:00:00Z');
        const operatingYear = date.getUTCFullYear();
        const operatingMonth = date.getUTCMonth() + 1;
        const taxRate = Number(taxProfile.rate);
        const netAmount = excelRound(input.netAmount, 2);
        const taxAmount = excelRound(netAmount * taxRate, 2);
        const totalAmount = excelRound(netAmount + taxAmount, 2);
        const isNonRecoverable = settings?.taxTreatment === 'NON_RECOVERABLE';
        const incomeStatementAmount = isNonRecoverable ? totalAmount : netAmount;

        const count = await tx.operatingExpense.count({ where: { tenantId: ctx.tenantId } });
        const expenseNumber = `GAS-${String(count + 1).padStart(4, '0')}`;
        const dueDate =
          input.paymentCondition === 'CREDIT'
            ? new Date(date.getTime() + (creditSettings?.defaultSupplierCreditDays ?? 30) * 86400000)
            : null;

        const expense = await tx.operatingExpense.create({
          data: {
            tenantId: ctx.tenantId,
            expenseNumber,
            date,
            operatingYear,
            operatingMonth,
            categoryId: category.id,
            description: input.description.trim(),
            netAmount,
            taxProfileId: taxProfile.id,
            taxRateSnapshot: taxRate,
            taxAmount,
            totalAmount,
            incomeStatementAmount,
            paymentCondition: input.paymentCondition,
            paymentStatus: input.paymentCondition === 'CASH' ? 'SETTLED' : 'PENDING',
            paymentMethodId: input.paymentCondition === 'CASH' ? input.paymentMethodId : null,
            financialAccountId: input.paymentCondition === 'CASH' ? input.financialAccountId : null,
            dueDate,
            receiptNumber: input.receiptNumber ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            createdBy: ctx.userId,
          },
        });

        if (input.paymentCondition === 'CREDIT' && dueDate) {
          await tx.accountPayable.create({
            data: {
              tenantId: ctx.tenantId,
              sourceType: 'EXPENSE',
              expenseId: expense.id,
              documentNumber: expenseNumber,
              creditorName: `Gasto: ${category.name}`,
              issueDate: date,
              dueDate,
              originalAmount: totalAmount,
              paidAmount: 0,
              balanceAmount: totalAmount,
              status: 'PENDING',
            },
          });
        } else if (input.paymentCondition === 'CASH' && input.financialAccountId) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              financialAccountId: input.financialAccountId,
              paymentMethodId: input.paymentMethodId ?? null,
              date,
              operatingYear,
              operatingMonth,
              direction: 'OUTFLOW',
              category: 'CASH_EXPENSE',
              amount: totalAmount,
              sourceType: 'EXPENSE',
              sourceId: expense.id,
              reference: expenseNumber,
              description: `Gasto ${expenseNumber}: ${input.description.trim()}`,
              createdBy: ctx.userId,
            },
          });
        }

        const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorUserId: actor?.id ?? null,
            action: 'EXPENSE_CONFIRMED',
            entityType: 'OperatingExpense',
            entityId: expense.id,
            afterJson: { expenseNumber, totalAmount, paymentCondition: input.paymentCondition },
          },
        });

        return expense;
      },
      { maxWait: 10000, timeout: 25000 },
    );
  }

  public async registerCustomerPayment(
    ctx: AuthenticatedTenantContext,
    input: RegisterReceivablePaymentInput,
  ) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'receivables', 'CREATE');

    if (input.amount <= 0) {
      throw new Error('El importe del cobro debe ser mayor a cero.');
    }

    return prisma.$transaction(
      async (tx) => {
        if (input.idempotencyKey) {
          const existing = await tx.salePayment.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: ctx.tenantId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing) return existing;
        }

        const [receivable, pm, fa] = await Promise.all([
          tx.accountReceivable.findFirst({
            where: { id: input.accountReceivableId, tenantId: ctx.tenantId },
          }),
          tx.paymentMethod.findFirst({
            where: { id: input.paymentMethodId, tenantId: ctx.tenantId },
          }),
          tx.financialAccount.findFirst({
            where: { id: input.financialAccountId, tenantId: ctx.tenantId },
          }),
        ]);

        if (!receivable) throw new Error('Cuenta por cobrar no encontrada o pertenece a otra empresa.');
        if (!pm) throw new Error('Método de pago no encontrado en esta empresa.');
        if (!fa) throw new Error('Cuenta financiera no encontrada en esta empresa.');

        const currentBalance = Number(receivable.balanceAmount);
        const amount = excelRound(input.amount, 2);
        if (currentBalance <= 0) {
          throw new Error('Esta factura ya está completamente liquidada.');
        }
        if (amount > currentBalance) {
          throw new Error(
            `El cobro (${amount}) supera el saldo pendiente de la factura (${currentBalance}).`,
          );
        }

        const date = new Date(input.date + 'T00:00:00Z');
        const count = await tx.salePayment.count({ where: { tenantId: ctx.tenantId } });
        const collectionNumber = `COB-${String(count + 1).padStart(4, '0')}`;

        const payment = await tx.salePayment.create({
          data: {
            tenantId: ctx.tenantId,
            collectionNumber,
            date,
            amount,
            paymentMethodId: pm.id,
            financialAccountId: fa.id,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            createdBy: ctx.userId,
          },
        });

        await tx.receivableAllocation.create({
          data: {
            tenantId: ctx.tenantId,
            accountReceivableId: receivable.id,
            salePaymentId: payment.id,
            allocatedAmount: amount,
          },
        });

        const newPaid = excelRound(Number(receivable.paidAmount) + amount, 2);
        const newBalance = excelRound(Number(receivable.originalAmount) - newPaid, 2);
        const newStatus = newBalance <= 0 ? 'SETTLED' : 'PARTIAL';

        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newStatus,
          },
        });

        await tx.sale.update({
          where: { id: receivable.saleId },
          data: { paymentStatus: newStatus },
        });

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            financialAccountId: fa.id,
            paymentMethodId: pm.id,
            date,
            operatingYear: date.getUTCFullYear(),
            operatingMonth: date.getUTCMonth() + 1,
            direction: 'INFLOW',
            category: 'RECEIVABLE_COLLECTION',
            amount,
            sourceType: 'SALE_PAYMENT',
            sourceId: payment.id,
            reference: collectionNumber,
            description: `Cobro ${collectionNumber} a factura ${receivable.documentNumber}`,
            createdBy: ctx.userId,
          },
        });

        const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorUserId: actor?.id ?? null,
            action: 'CUSTOMER_PAYMENT_REGISTERED',
            entityType: 'SalePayment',
            entityId: payment.id,
            afterJson: { collectionNumber, documentNumber: receivable.documentNumber, amount, newBalance },
          },
        });

        return payment;
      },
      { maxWait: 10000, timeout: 25000 },
    );
  }

  public async registerSupplierPayment(
    ctx: AuthenticatedTenantContext,
    input: RegisterPayablePaymentInput,
  ) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'payables', 'CREATE');

    if (input.amount <= 0) {
      throw new Error('El importe del pago debe ser mayor a cero.');
    }

    return prisma.$transaction(
      async (tx) => {
        if (input.idempotencyKey) {
          const existing = await tx.purchasePayment.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: ctx.tenantId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing) return existing;
        }

        const [payable, pm, fa] = await Promise.all([
          tx.accountPayable.findFirst({
            where: { id: input.accountPayableId, tenantId: ctx.tenantId },
          }),
          tx.paymentMethod.findFirst({
            where: { id: input.paymentMethodId, tenantId: ctx.tenantId },
          }),
          tx.financialAccount.findFirst({
            where: { id: input.financialAccountId, tenantId: ctx.tenantId },
          }),
        ]);

        if (!payable) throw new Error('Cuenta por pagar no encontrada o pertenece a otra empresa.');
        if (!pm) throw new Error('Método de pago no encontrado en esta empresa.');
        if (!fa) throw new Error('Cuenta financiera no encontrada en esta empresa.');

        const currentBalance = Number(payable.balanceAmount);
        const amount = excelRound(input.amount, 2);
        if (currentBalance <= 0) {
          throw new Error('Esta obligación ya está completamente pagada.');
        }
        if (amount > currentBalance) {
          throw new Error(
            `El pago (${amount}) supera el saldo pendiente de la obligación (${currentBalance}).`,
          );
        }

        const date = new Date(input.date + 'T00:00:00Z');
        const count = await tx.purchasePayment.count({ where: { tenantId: ctx.tenantId } });
        const paymentNumber = `PAG-${String(count + 1).padStart(4, '0')}`;

        const payment = await tx.purchasePayment.create({
          data: {
            tenantId: ctx.tenantId,
            paymentNumber,
            date,
            amount,
            paymentMethodId: pm.id,
            financialAccountId: fa.id,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            createdBy: ctx.userId,
          },
        });

        await tx.payableAllocation.create({
          data: {
            tenantId: ctx.tenantId,
            accountPayableId: payable.id,
            purchasePaymentId: payment.id,
            allocatedAmount: amount,
          },
        });

        const newPaid = excelRound(Number(payable.paidAmount) + amount, 2);
        const newBalance = excelRound(Number(payable.originalAmount) - newPaid, 2);
        const newStatus = newBalance <= 0 ? 'SETTLED' : 'PARTIAL';

        await tx.accountPayable.update({
          where: { id: payable.id },
          data: {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newStatus,
          },
        });

        if (payable.purchaseId) {
          await tx.purchase.update({
            where: { id: payable.purchaseId },
            data: { paymentStatus: newStatus },
          });
        }
        if (payable.expenseId) {
          await tx.operatingExpense.update({
            where: { id: payable.expenseId },
            data: { paymentStatus: newStatus },
          });
        }

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            financialAccountId: fa.id,
            paymentMethodId: pm.id,
            date,
            operatingYear: date.getUTCFullYear(),
            operatingMonth: date.getUTCMonth() + 1,
            direction: 'OUTFLOW',
            category: 'PAYABLE_PAYMENT',
            amount,
            sourceType: 'PURCHASE_PAYMENT',
            sourceId: payment.id,
            reference: paymentNumber,
            description: `Pago ${paymentNumber} a ${payable.documentNumber}`,
            createdBy: ctx.userId,
          },
        });

        const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorUserId: actor?.id ?? null,
            action: 'SUPPLIER_PAYMENT_REGISTERED',
            entityType: 'PurchasePayment',
            entityId: payment.id,
            afterJson: { paymentNumber, documentNumber: payable.documentNumber, amount, newBalance },
          },
        });

        return payment;
      },
      { maxWait: 10000, timeout: 25000 },
    );
  }

  public async transferBetweenAccounts(
    ctx: AuthenticatedTenantContext,
    input: TransferFundsInput,
  ) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'cash_transfers', 'CREATE');

    if (input.sourceAccountId === input.destinationAccountId) {
      throw new Error('La cuenta origen y destino deben ser distintas.');
    }
    if (input.amount <= 0) {
      throw new Error('El importe de la transferencia debe ser mayor a cero.');
    }

    return prisma.$transaction(
      async (tx) => {
        const [source, dest] = await Promise.all([
          tx.financialAccount.findFirst({
            where: { id: input.sourceAccountId, tenantId: ctx.tenantId },
          }),
          tx.financialAccount.findFirst({
            where: { id: input.destinationAccountId, tenantId: ctx.tenantId },
          }),
        ]);

        if (!source || !dest) {
          throw new Error('Cuenta origen o destino no encontrada en esta empresa.');
        }

        const date = new Date(input.date + 'T00:00:00Z');
        const operatingYear = date.getUTCFullYear();
        const operatingMonth = date.getUTCMonth() + 1;
        const amount = excelRound(input.amount, 2);
        const count = await tx.bankTransfer.count({ where: { tenantId: ctx.tenantId } });
        const transferNumber = `TRF-${String(count + 1).padStart(4, '0')}`;

        const transfer = await tx.bankTransfer.create({
          data: {
            tenantId: ctx.tenantId,
            transferNumber,
            date,
            operatingYear,
            operatingMonth,
            sourceAccountId: source.id,
            destinationAccountId: dest.id,
            amount,
            reference: input.reference ?? null,
            reason: input.reason ?? null,
            createdBy: ctx.userId,
          },
        });

        await Promise.all([
          tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              financialAccountId: source.id,
              date,
              operatingYear,
              operatingMonth,
              direction: 'OUTFLOW',
              category: 'TRANSFER_OUT',
              amount,
              sourceType: 'BANK_TRANSFER',
              sourceId: transfer.id,
              reference: transferNumber,
              description: `Transferencia ${transferNumber} hacia ${dest.name}`,
              createdBy: ctx.userId,
            },
          }),
          tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              financialAccountId: dest.id,
              date,
              operatingYear,
              operatingMonth,
              direction: 'INFLOW',
              category: 'TRANSFER_IN',
              amount,
              sourceType: 'BANK_TRANSFER',
              sourceId: transfer.id,
              reference: transferNumber,
              description: `Transferencia ${transferNumber} desde ${source.name}`,
              createdBy: ctx.userId,
            },
          }),
        ]);

        const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorUserId: actor?.id ?? null,
            action: 'BANK_TRANSFER_CREATED',
            entityType: 'BankTransfer',
            entityId: transfer.id,
            afterJson: { transferNumber, source: source.name, dest: dest.name, amount },
          },
        });

        return transfer;
      },
      { maxWait: 10000, timeout: 25000 },
    );
  }

  public async registerCashAdjustment(
    ctx: AuthenticatedTenantContext,
    input: RegisterCashAdjustmentInput,
  ) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'cash_adjustments', 'CREATE');

    if (input.amount <= 0) {
      throw new Error('El importe del ajuste de caja debe ser mayor a cero.');
    }
    if (!input.reason.trim()) {
      throw new Error('El motivo del ajuste de caja es obligatorio.');
    }

    return prisma.$transaction(
      async (tx) => {
        const account = await tx.financialAccount.findFirst({
          where: { id: input.financialAccountId, tenantId: ctx.tenantId },
        });
        if (!account) {
          throw new Error('Cuenta financiera no encontrada en esta empresa.');
        }

        const date = new Date(input.date + 'T00:00:00Z');
        const operatingYear = date.getUTCFullYear();
        const operatingMonth = date.getUTCMonth() + 1;
        const amount = excelRound(input.amount, 2);
        const count = await tx.cashAdjustment.count({ where: { tenantId: ctx.tenantId } });
        const adjustmentNumber = `COR-${String(count + 1).padStart(4, '0')}`;

        const adjustment = await tx.cashAdjustment.create({
          data: {
            tenantId: ctx.tenantId,
            adjustmentNumber,
            date,
            operatingYear,
            operatingMonth,
            financialAccountId: account.id,
            direction: input.direction,
            amount,
            reason: input.reason.trim(),
            relatedDocumentRef: input.relatedDocumentRef ?? null,
            createdBy: ctx.userId,
          },
        });

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            financialAccountId: account.id,
            date,
            operatingYear,
            operatingMonth,
            direction: input.direction,
            category: input.direction === 'INFLOW' ? 'CASH_ADJUSTMENT_IN' : 'CASH_ADJUSTMENT_OUT',
            amount,
            sourceType: 'CASH_ADJUSTMENT',
            sourceId: adjustment.id,
            reference: adjustmentNumber,
            description: `Ajuste ${adjustmentNumber}: ${input.reason.trim()}`,
            createdBy: ctx.userId,
          },
        });

        const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorUserId: actor?.id ?? null,
            action: 'CASH_ADJUSTMENT_CREATED',
            entityType: 'CashAdjustment',
            entityId: adjustment.id,
            reason: input.reason.trim(),
            afterJson: { adjustmentNumber, account: account.name, direction: input.direction, amount },
          },
        });

        return adjustment;
      },
      { maxWait: 10000, timeout: 25000 },
    );
  }

  public async listAccountBalances(tenantId: string) {
    const [accounts, grouped] = await Promise.all([
      prisma.financialAccount.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      prisma.cashMovement.groupBy({
        by: ['financialAccountId', 'direction'],
        where: { tenantId },
        _sum: { amount: true },
      }),
    ]);

    return accounts.map((acc) => {
      const inflow = Number(
        grouped.find((g) => g.financialAccountId === acc.id && g.direction === 'INFLOW')?._sum
          .amount ?? 0,
      );
      const outflow = Number(
        grouped.find((g) => g.financialAccountId === acc.id && g.direction === 'OUTFLOW')?._sum
          .amount ?? 0,
      );
      const opening = Number(acc.openingBalance);
      const balance = excelRound(opening + inflow - outflow, 2);

      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        openingBalance: opening,
        totalInflows: excelRound(inflow, 2),
        totalOutflows: excelRound(outflow, 2),
        currentBalance: balance,
      };
    });
  }
}
