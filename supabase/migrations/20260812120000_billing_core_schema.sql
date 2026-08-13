-- ============================================================
-- Time tracking, expenses, invoicing, payments — core schema
-- ============================================================

-- ---------- Enums ----------
CREATE TYPE public.fee_structure_type AS ENUM ('hourly', 'flat', 'contingency', 'subscription');
CREATE TYPE public.time_entry_status AS ENUM ('unbilled', 'billed', 'written_off');
CREATE TYPE public.expense_status AS ENUM ('unbilled', 'billed', 'written_off');
CREATE TYPE public.expense_type AS ENUM ('hard_cost', 'soft_cost');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');

-- ---------- Rate / fee-structure fields on existing tables ----------
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS fee_structure public.fee_structure_type NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS default_hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS flat_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS contingency_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS subscription_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS subscription_period text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_hourly_rate numeric(12,2);

ALTER TABLE public.case_assignments
  ADD COLUMN IF NOT EXISTS billing_rate numeric(12,2);

-- Shared updated_at trigger helper, reused by the tables below.
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ TIME_ENTRIES ============
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  timekeeper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  code text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  is_billable boolean NOT NULL DEFAULT true,
  rate numeric(12,2),
  status public.time_entry_status NOT NULL DEFAULT 'unbilled',
  invoice_id uuid,
  timer_started_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_case_id ON public.time_entries(case_id, entry_date DESC);
CREATE INDEX idx_time_entries_status ON public.time_entries(case_id, status);
CREATE INDEX idx_time_entries_invoice_id ON public.time_entries(invoice_id) WHERE invoice_id IS NOT NULL;
-- Only one open timer per timekeeper at a time.
CREATE UNIQUE INDEX one_running_timer_per_user ON public.time_entries(timekeeper_id)
  WHERE timer_started_at IS NOT NULL AND duration_minutes IS NULL;

CREATE TRIGGER trg_time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_select" ON public.time_entries FOR SELECT TO authenticated
  USING (public.is_active_user() AND public.can_read_case(case_id) AND public.current_role() <> 'client');

CREATE POLICY "time_entries_insert" ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND status = 'unbilled' AND invoice_id IS NULL
    AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (public.effective_case_access(case_id) = 'full' AND timekeeper_id = auth.uid())
    )
  );

CREATE POLICY "time_entries_update" ON public.time_entries FOR UPDATE TO authenticated
  USING (
    public.is_active_user() AND status = 'unbilled' AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (timekeeper_id = auth.uid() AND public.effective_case_access(case_id) = 'full')
    )
  )
  WITH CHECK (
    -- Status/invoice_id can only move to billed/void via the send_invoice / void_invoice
    -- SECURITY DEFINER RPCs, never directly through this policy.
    status = 'unbilled' AND invoice_id IS NULL
    AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (timekeeper_id = auth.uid() AND public.effective_case_access(case_id) = 'full')
    )
  );

CREATE POLICY "time_entries_delete" ON public.time_entries FOR DELETE TO authenticated
  USING (
    public.is_active_user() AND status = 'unbilled' AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (timekeeper_id = auth.uid() AND public.effective_case_access(case_id) = 'full')
    )
  );

-- ============ EXPENSES ============
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  incurred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  expense_type public.expense_type NOT NULL DEFAULT 'soft_cost',
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  receipt_path text,
  status public.expense_status NOT NULL DEFAULT 'unbilled',
  invoice_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_case_id ON public.expenses(case_id, expense_date DESC);
CREATE INDEX idx_expenses_status ON public.expenses(case_id, status);
CREATE INDEX idx_expenses_invoice_id ON public.expenses(invoice_id) WHERE invoice_id IS NOT NULL;

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_active_user() AND public.can_read_case(case_id) AND public.current_role() <> 'client');

CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND status = 'unbilled' AND invoice_id IS NULL
    AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (public.effective_case_access(case_id) = 'full' AND incurred_by = auth.uid())
    )
  );

CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.is_active_user() AND status = 'unbilled' AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (incurred_by = auth.uid() AND public.effective_case_access(case_id) = 'full')
    )
  )
  WITH CHECK (
    status = 'unbilled' AND invoice_id IS NULL
    AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (incurred_by = auth.uid() AND public.effective_case_access(case_id) = 'full')
    )
  );

CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE TO authenticated
  USING (
    public.is_active_user() AND status = 'unbilled' AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (incurred_by = auth.uid() AND public.effective_case_access(case_id) = 'full')
    )
  );

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  fee_structure_snapshot public.fee_structure_type NOT NULL,
  issue_date date,
  due_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  sent_at timestamptz,
  voided_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_invoice_id_fkey FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_invoice_id_fkey FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_invoices_case_id ON public.invoices(case_id, created_at DESC);
CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- can_read_case() already covers the client role's own non-private cases via
-- current_client_id(), so the same predicate gives clients portal read access —
-- just gated off draft invoices, which staff shouldn't expose before sending.
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (
    public.is_active_user() AND public.can_read_case(case_id)
    AND (public.current_role() <> 'client' OR status <> 'draft')
  );

CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user() AND status = 'draft'
    AND (public.current_role() IN ('super_admin', 'admin') OR public.effective_case_access(case_id) = 'full')
  );

-- Draft edits go through the app; status/sent_at/voided_at transitions beyond
-- 'draft' are only ever performed by the send_invoice/void_invoice SECURITY
-- DEFINER RPCs (added in the next migration), which bypass RLS as their owner.
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (
    public.is_active_user() AND status = 'draft'
    AND (public.current_role() IN ('super_admin', 'admin') OR public.effective_case_access(case_id) = 'full')
  )
  WITH CHECK (
    status = 'draft'
    AND (public.current_role() IN ('super_admin', 'admin') OR public.effective_case_access(case_id) = 'full')
  );

-- A draft invoice hasn't touched any time entry / expense status yet, so it can
-- be discarded outright. Once sent (or beyond), void_invoice() is the only
-- retraction path so financial records never disappear.
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated
  USING (
    public.is_active_user() AND status = 'draft'
    AND (public.current_role() IN ('super_admin', 'admin') OR public.effective_case_access(case_id) = 'full')
  );

-- ============ INVOICE_LINE_ITEMS ============
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN
    ('time_entry', 'expense', 'flat_fee', 'contingency_fee', 'subscription_fee', 'custom')),
  time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(10,2),
  rate numeric(12,2),
  amount numeric(12,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_line_items_select" ON public.invoice_line_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_line_items.invoice_id
      AND public.is_active_user() AND public.can_read_case(i.case_id)
      AND (public.current_role() <> 'client' OR i.status <> 'draft')
  ));

CREATE POLICY "invoice_line_items_write" ON public.invoice_line_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_line_items.invoice_id AND i.status = 'draft'
      AND public.is_active_user()
      AND (public.current_role() IN ('super_admin', 'admin') OR public.effective_case_access(i.case_id) = 'full')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_line_items.invoice_id AND i.status = 'draft'
      AND public.is_active_user()
      AND (public.current_role() IN ('super_admin', 'admin') OR public.effective_case_access(i.case_id) = 'full')
  ));

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_invoice_id ON public.payments(invoice_id, paid_at DESC);

GRANT SELECT, INSERT, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND public.is_active_user() AND public.can_read_case(i.case_id)
      AND (public.current_role() <> 'client' OR i.status <> 'draft')
  ));

-- Payments are a firm-level financial action, not a per-timekeeper one.
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user() AND public.current_role() IN ('super_admin', 'admin')
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = payments.invoice_id AND i.status NOT IN ('draft', 'void'))
  );

CREATE POLICY "payments_delete" ON public.payments FOR DELETE TO authenticated
  USING (public.is_active_user() AND public.current_role() IN ('super_admin', 'admin'));

-- ============ INVOICE_REMINDERS ============
CREATE TABLE public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  offset_days integer NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_reminders_unsent ON public.invoice_reminders(invoice_id) WHERE sent = false;

GRANT SELECT ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;
ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_reminders_select" ON public.invoice_reminders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_reminders.invoice_id
      AND public.is_active_user() AND public.can_read_case(i.case_id) AND public.current_role() <> 'client'
  ));

-- ---------- Firm-wide billing defaults ----------
INSERT INTO public.firm_settings (key, value) VALUES
  ('default_hourly_rate', '0'::jsonb),
  ('invoice_number_prefix', '"INV"'::jsonb),
  ('invoice_due_days', '30'::jsonb),
  ('late_payment_interest_pct', '0'::jsonb),
  ('invoice_reminder_offsets_days', '[3, 7, 14, 30]'::jsonb)
ON CONFLICT (key) DO NOTHING;
