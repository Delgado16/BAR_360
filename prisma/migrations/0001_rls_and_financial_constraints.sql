-- ============================================================================
-- MI NEGOCIO PRO 360 — POLÍTICAS DE ROW LEVEL SECURITY (RLS) E INTEGRIDAD MULTI-TENANT
-- Aplicable en PostgreSQL / Supabase (Sección 4, Requisitos 6, 7 y 8)
-- ============================================================================

-- Función helper para obtener los tenant_id a los cuales pertenece activamente el usuario autenticado en Supabase Auth
CREATE OR REPLACE FUNCTION public.user_active_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  INNER JOIN public.users u ON u.id = tm.user_id
  WHERE u.supabase_auth_id = auth.uid()
    AND tm.status = 'ACTIVE'
    AND u.is_active = true;
$$;

-- Habilitar RLS en todas las tablas empresariales
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_monthly_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reconciliations ENABLE ROW LEVEL SECURITY;

-- Restricciones CHECK financieras adicionales (Sección 6.9 y 13)
ALTER TABLE public.products
  ADD CONSTRAINT chk_products_non_negative_prices
  CHECK (sale_price >= 0 AND reference_cost >= 0 AND minimum_stock >= 0);

ALTER TABLE public.sale_items
  ADD CONSTRAINT chk_sale_items_valid_amounts
  CHECK (quantity > 0 AND unit_price >= 0 AND discount_percentage >= 0 AND discount_percentage <= 1);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT chk_purchase_items_valid_amounts
  CHECK (quantity > 0 AND unit_cost >= 0 AND discount_percentage >= 0 AND discount_percentage <= 1);

ALTER TABLE public.operating_expenses
  ADD CONSTRAINT chk_operating_expenses_positive
  CHECK (net_amount > 0 AND tax_amount >= 0 AND total_amount > 0);

ALTER TABLE public.bank_transfers
  ADD CONSTRAINT chk_bank_transfers_distinct_accounts
  CHECK (source_account_id <> destination_account_id AND amount > 0);

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT chk_inventory_adjustments_positive_qty_and_reason
  CHECK (quantity > 0 AND length(trim(reason)) > 0);

ALTER TABLE public.cash_adjustments
  ADD CONSTRAINT chk_cash_adjustments_positive_amount_and_reason
  CHECK (amount > 0 AND length(trim(reason)) > 0);

-- Políticas RLS de aislamiento estricto por tenant_id para acceso directo desde Supabase
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'business_settings', 'credit_settings', 'tax_profiles', 'product_categories',
    'expense_categories', 'units_of_measure', 'payment_methods', 'financial_accounts',
    'products', 'customers', 'suppliers', 'sales', 'sale_items', 'sale_payments',
    'purchases', 'purchase_items', 'purchase_payments', 'operating_expenses',
    'inventory_opening_balances', 'inventory_movements', 'inventory_adjustments',
    'inventory_monthly_costs', 'accounts_receivable', 'receivable_allocations',
    'accounts_payable', 'payable_allocations', 'cash_movements', 'bank_transfers',
    'cash_adjustments', 'financial_reconciliations'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation_select_%I ON public.%I FOR SELECT USING (tenant_id IN (SELECT public.user_active_tenant_ids()));',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_modify_%I ON public.%I FOR ALL USING (tenant_id IN (SELECT public.user_active_tenant_ids())) WITH CHECK (tenant_id IN (SELECT public.user_active_tenant_ids()));',
      t, t
    );
  END LOOP;
END $$;

