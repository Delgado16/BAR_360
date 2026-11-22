import { prisma } from './prisma-client';

export async function ensureTenantWorkspace(tenantSlug: string) {
  const existing = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { settings: true, creditSettings: true },
  });
  if (existing && existing.settings) {
    return existing;
  }

  const isFerreteria = tenantSlug === 'ferreteria-el-martillo';
  const tradeName = isFerreteria
    ? 'Ferretería El Martillo'
    : tenantSlug === 'fronteras-bar'
      ? 'Fronteras Bar'
      : tenantSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const currencyCode = isFerreteria ? 'USD' : 'NIO';
  const currencySymbol = isFerreteria ? '$' : 'C$';

  // Asegurar monedas base
  await prisma.currency.upsert({
    where: { code: 'NIO' },
    update: {},
    create: { code: 'NIO', name: 'Córdoba nicaragüense', symbol: 'C$', decimalPlaces: 2 },
  });
  await prisma.currency.upsert({
    where: { code: 'USD' },
    update: {},
    create: { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimalPlaces: 2 },
  });

  const tenant = await prisma.$transaction(async (tx) => {
    const t =
      existing ??
      (await tx.tenant.create({
        data: {
          slug: tenantSlug,
          legalName: tradeName,
          tradeName,
          businessType: isFerreteria ? 'Ferretería' : 'Comercio / Bar y Restaurante',
          status: 'ACTIVE',
        },
      }));

    await Promise.all([
      tx.businessSettings.upsert({
        where: { tenantId: t.id },
        update: {},
        create: {
          tenantId: t.id,
          tradeName,
          businessType: t.businessType,
          currencyCode,
          currencySymbol,
          operatingYear: 2026,
          analysisMonth: 11,
        },
      }),
      tx.creditSettings.upsert({
        where: { tenantId: t.id },
        update: {},
        create: {
          tenantId: t.id,
          defaultCustomerCreditDays: 30,
          defaultSupplierCreditDays: 30,
        },
      }),
      tx.taxProfile.createMany({
        data: [
          { tenantId: t.id, name: 'Sin impuesto', rate: 0, isDefault: true },
          { tenantId: t.id, name: 'IVA 15%', rate: 0.15, isDefault: false },
        ],
        skipDuplicates: true,
      }),
      tx.productCategory.createMany({
        data: [
          { tenantId: t.id, name: 'Bebidas', sortOrder: 1 },
          { tenantId: t.id, name: 'Alimentos', sortOrder: 2 },
          { tenantId: t.id, name: 'Ferretería', sortOrder: 3 },
          { tenantId: t.id, name: 'Servicios', sortOrder: 4 },
          { tenantId: t.id, name: 'Otros', sortOrder: 5 },
        ],
        skipDuplicates: true,
      }),
      tx.expenseCategory.createMany({
        data: [
          { tenantId: t.id, name: 'Alquiler', sortOrder: 1 },
          { tenantId: t.id, name: 'Electricidad', sortOrder: 2 },
          { tenantId: t.id, name: 'Salarios', sortOrder: 3 },
          { tenantId: t.id, name: 'Otros', sortOrder: 4 },
        ],
        skipDuplicates: true,
      }),
      tx.unitOfMeasure.createMany({
        data: [
          { tenantId: t.id, name: 'Unidad', abbreviation: 'u' },
          { tenantId: t.id, name: 'Botella', abbreviation: 'bot' },
          { tenantId: t.id, name: 'Caja', abbreviation: 'cja' },
          { tenantId: t.id, name: 'Servicio', abbreviation: 'srv' },
        ],
        skipDuplicates: true,
      }),
      tx.paymentMethod.createMany({
        data: [
          { tenantId: t.id, name: 'Efectivo', sortOrder: 1 },
          { tenantId: t.id, name: 'Transferencia', sortOrder: 2 },
          { tenantId: t.id, name: 'Tarjeta', sortOrder: 3 },
        ],
        skipDuplicates: true,
      }),
      tx.financialAccount.createMany({
        data: [
          { tenantId: t.id, name: 'Caja general', type: 'CASH', openingBalance: 0 },
          { tenantId: t.id, name: 'Banco principal', type: 'BANK', openingBalance: 0 },
        ],
        skipDuplicates: true,
      }),
      tx.customer.upsert({
        where: { tenantId_code: { tenantId: t.id, code: 'CLI-GEN' } },
        update: {},
        create: {
          tenantId: t.id,
          code: 'CLI-GEN',
          name: 'Cliente Mostrador',
          customerType: 'GENERIC',
        },
      }),
    ]);

    return t;
  }, { maxWait: 10000, timeout: 30000 });

  return prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    include: { settings: true, creditSettings: true },
  });
}
