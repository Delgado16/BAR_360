# Arquitectura Técnica y Multi-Tenant — MI NEGOCIO PRO 360

## 1. Arquitectura en Capas (Clean / Hexagonal Adaptada a Next.js App Router)

```
src/
  app/
    (public)/             # Landing page comercial, planes y precios
    (auth)/               # Login, registro, recuperación de contraseña, aceptación de invitaciones
    (platform)/           # Panel Global del Superadministrador SaaS
    (tenant)/[tenantSlug] # Panel Empresarial Multi-Tenant (18 módulos operativos)
    api/                  # Route Handlers (webhooks de pagos, exportaciones Excel/PDF, healthcheck)
  components/
    ui/                   # Primitivas shadcn/ui
    layout/               # Sidebar empresarial, Sidebar plataforma, Topbar, Selector de Tenant, Tema
    dashboard/            # Tarjetas KPI, Cintillos de alerta, Gráficos Recharts
    tables/               # DataTables con TanStack Table (filtros, ordenamiento, paginación server-side)
    forms/                # Formularios tipados con React Hook Form + Zod
  modules/                # Casos de uso y Server Actions por módulo de negocio
  domain/
    entities/             # Tipos y modelos puros de dominio
    services/             # Servicios de dominio (financieros, inventario CPP, conciliación, simulador)
    calculations/         # Funciones puras deterministas (Decimal.js) verificadas contra el Excel
    policies/             # Políticas RBAC, límites de suscripción y validaciones multi-tenant
  infrastructure/
    database/             # Cliente Prisma con extensión de aislamiento por tenant + RLS Supabase
    auth/                 # Integración Supabase Auth + resolución de sesión y membresía activa
    billing/              # Abstracción BillingProvider + adaptadores
    exporters/            # Generadores ExcelJS y PDF del lado del servidor
    logging/              # Logger estructurado y servicio de auditoría inmutable
```

## 2. Estrategia de Aislamiento Multi-Tenant y Seguridad

1. **Resolución de Tenant en el Servidor**:
   - El `tenant_id` activo jamás se confía desde un input oculto del cliente. Se resuelve en el servidor verificando la sesión de Supabase Auth contra la tabla `tenant_memberships` (`status = 'ACTIVE'`) y el `tenantSlug` de la ruta o cookie firmada de sesión.
2. **Doble Barrera de Protección (Application Guard + PostgreSQL RLS & Composite Constraints)**:
   - Todos los servicios de dominio requieren un contexto autenticado `TenantContext { tenantId, userId, roleCode, permissions }`.
   - En PostgreSQL, todas las tablas operativas incluyen `tenant_id UUID NOT NULL` con índices compuestos y políticas de Row Level Security (RLS), además de validación de pertenencia de claves foráneas al mismo `tenant_id`.
3. **Integridad Financiera y Transaccionalidad**:
   - Uso estricto de `Decimal` (en PostgreSQL `NUMERIC(14,2)` / `NUMERIC(14,4)` / `NUMERIC(14,6)`) para evitar errores de coma flotante IEEE 754.
   - Claves de idempotencia (`idempotency_key`) únicas por `tenant_id` en ventas, compras, gastos, cobros, pagos y transferencias para impedir duplicados por doble clic o reintentos de red.
   - Prohibición de borrado en cascada (`onDelete: Restrict`) en documentos financieros confirmados. Las anulaciones ejecutan transacciones compensatorias auditadas (`SaleStatusHistory`, `InventoryMovement` reverso, `CashMovement` reverso, `AuditLog`).

