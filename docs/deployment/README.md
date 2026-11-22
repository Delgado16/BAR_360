# Guía de Despliegue, Operación y Respaldos — MI NEGOCIO PRO 360

## 1. Arquitectura de Producción

- **Frontend y Backend (SSR / Server Actions / Route Handlers)**: Vercel (Next.js App Router, TypeScript estricto).
- **Base de Datos y Autenticación**: Supabase (PostgreSQL 15+ con Row Level Security + Supabase Auth).
- **ORM y Migraciones**: Prisma ORM con migraciones versionadas en `prisma/migrations/`.

## 2. Variables de Entorno Requeridas

Configurar en Vercel (Production & Preview) sin exponer llaves privadas en `NEXT_PUBLIC_*`:

```env
DATABASE_URL="postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
BILLING_WEBHOOK_SECRET="<hmac-sha256-secret>"
NEXT_PUBLIC_APP_URL="https://app.minegociopro360.com"
```

## 3. Procedimiento de Despliegue

1. **Generar cliente Prisma y validar tipos**:
   ```bash
   npm run db:generate
   npm run typecheck
   ```
2. **Ejecutar migraciones en base de datos**:
   ```bash
   npm run db:deploy
   ```
3. **Aplicar políticas RLS y restricciones financieras (`CHECK`)**:
   Ejecutar el script SQL `prisma/migrations/0001_rls_and_financial_constraints.sql` en Supabase SQL Editor o `psql "$DIRECT_URL" -f prisma/migrations/0001_rls_and_financial_constraints.sql`.
4. **Sembrar catálogos iniciales de plataforma** (monedas y planes `BASIC`, `PRO`, `ENTERPRISE`):
   ```bash
   npm run db:seed
   ```
5. **Ejecutar suite maestra de regresión antes de promover a producción**:
   ```bash
   node scripts/run-all-tests.mjs
   ```

## 4. Monitoreo y Logs Estructurados

- Todas las operaciones críticas (ventas, compras, conciliaciones, webhooks de suscripción, importación Excel y accesos de soporte) registran eventos en `audit_logs` con `tenant_id`, `user_id`, `action`, `entity_type`, `entity_id` y `created_at`.
- Configurar alertas de errores 5xx y latencia en Vercel Observability / Sentry.
- Revisar periódicamente `payment_provider_events` para confirmar idempotencia y cero eventos fallidos en webhooks de facturación.

## 5. Respaldos y Procedimiento Probado de Restauración

### Política de Respaldos
- **Supabase PITR (Point-in-Time Recovery)**: Habilitado en producción para recuperación al segundo.
- **Respaldo lógico diario (`pg_dump`)**:
  ```bash
  pg_dump "$DIRECT_URL" --format=custom --no-owner --no-privileges -f "backup_mnp360_$(date +%F).dump"
  ```

### Procedimiento de Restauración (Simulacro Mensual Obligatorio)
1. Crear base de datos de staging limpia en Supabase o PostgreSQL local.
2. Restaurar el respaldo:
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges -d "$STAGING_DIRECT_URL" backup_mnp360_YYYY-MM-DD.dump
   ```
3. Verificar integridad referencial y políticas RLS:
   ```bash
   psql "$STAGING_DIRECT_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"
   ```
4. Verificar que los 31 controles de conciliación (`CONTROLES`) devuelvan 0 diferencias en los tenants de muestra antes de redirigir tráfico.
