-- ============================================================
-- Invoice numbering, send/void RPCs, and payment reconciliation
-- ============================================================

-- ---------- next_invoice_number() ----------
-- Mirrors next_case_ref()/next_client_ref()'s advisory-lock + max-regex pattern,
-- with the prefix configurable via firm_settings.invoice_number_prefix.
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_prefix text;
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_number_' || v_year));

  SELECT NULLIF(btrim(value #>> '{}'), '') INTO v_prefix
  FROM public.firm_settings WHERE key = 'invoice_number_prefix';
  v_prefix := COALESCE(v_prefix, 'INV');

  SELECT COALESCE(MAX((regexp_match(invoice_number, '^' || v_prefix || '-' || v_year || '-(\d+)$'))[1]::integer), 0) + 1
  INTO v_next
  FROM public.invoices
  WHERE invoice_number ~ ('^' || v_prefix || '-' || v_year || '-\d+$');

  RETURN v_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;

-- ---------- send_invoice() ----------
-- Atomically finalizes a draft: sets issue/due dates, flips every referenced
-- time entry / expense to 'billed' + invoice_id (so they can never be pulled
-- into a second invoice), and hands back the updated row. SECURITY DEFINER so
-- it can write past the "unbilled only" RLS on time_entries/expenses, but it
-- re-checks authorization itself first — bypassing RLS is not the same as
-- bypassing access control here.
CREATE OR REPLACE FUNCTION public.send_invoice(_invoice_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_due_days integer;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft invoices can be sent.';
  END IF;
  IF NOT public.is_active_user() OR NOT (
    public.current_role() IN ('super_admin', 'admin')
    OR public.effective_case_access(v_invoice.case_id) = 'full'
  ) THEN
    RAISE EXCEPTION 'Not authorized to send this invoice.';
  END IF;

  SELECT NULLIF(btrim(value #>> '{}'), '')::integer INTO v_due_days
  FROM public.firm_settings WHERE key = 'invoice_due_days';
  v_due_days := COALESCE(v_due_days, 30);

  UPDATE public.invoices
  SET status = 'sent',
      issue_date = COALESCE(issue_date, CURRENT_DATE),
      due_date = COALESCE(due_date, CURRENT_DATE + v_due_days),
      sent_at = now()
  WHERE id = _invoice_id
  RETURNING * INTO v_invoice;

  UPDATE public.time_entries
  SET status = 'billed', invoice_id = _invoice_id
  WHERE id IN (
    SELECT time_entry_id FROM public.invoice_line_items
    WHERE invoice_id = _invoice_id AND time_entry_id IS NOT NULL
  );

  UPDATE public.expenses
  SET status = 'billed', invoice_id = _invoice_id
  WHERE id IN (
    SELECT expense_id FROM public.invoice_line_items
    WHERE invoice_id = _invoice_id AND expense_id IS NOT NULL
  );

  RETURN v_invoice;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_invoice(uuid) TO authenticated;

-- ---------- void_invoice() ----------
-- Only sent/partially_paid/overdue invoices can be voided (drafts are just
-- deleted; already-void or paid invoices shouldn't be un-billed retroactively
-- by this path). Releases every referenced time entry / expense back to
-- 'unbilled' so they can be corrected and re-billed on a fresh invoice.
CREATE OR REPLACE FUNCTION public.void_invoice(_invoice_id uuid, _reason text DEFAULT NULL)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;
  IF v_invoice.status NOT IN ('sent', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'Only sent, partially paid, or overdue invoices can be voided.';
  END IF;
  IF NOT public.is_active_user() OR public.current_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only admins can void an invoice.';
  END IF;

  UPDATE public.invoices
  SET status = 'void',
      voided_at = now(),
      notes = CASE WHEN _reason IS NOT NULL AND btrim(_reason) <> ''
        THEN COALESCE(notes || E'\n', '') || 'Voided: ' || _reason
        ELSE notes END
  WHERE id = _invoice_id
  RETURNING * INTO v_invoice;

  UPDATE public.time_entries SET status = 'unbilled', invoice_id = NULL WHERE invoice_id = _invoice_id;
  UPDATE public.expenses SET status = 'unbilled', invoice_id = NULL WHERE invoice_id = _invoice_id;

  RETURN v_invoice;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated;

-- ---------- Payment reconciliation trigger ----------
-- Recomputes invoices.amount_paid/status whenever a payment is inserted,
-- updated, or deleted, so status is always derived from real payment rows
-- rather than something app code sets directly.
CREATE OR REPLACE FUNCTION public.tg_recalc_invoice_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric(12,2);
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.payments WHERE invoice_id = v_invoice_id;
  SELECT total INTO v_total FROM public.invoices WHERE id = v_invoice_id;

  UPDATE public.invoices
  SET amount_paid = v_paid,
      status = CASE
        WHEN status IN ('void', 'draft') THEN status
        WHEN v_paid >= v_total AND v_total > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partially_paid'
        WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue'
        ELSE 'sent'
      END
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_payments_recalc_invoice
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_recalc_invoice_from_payments();

-- ---------- Overdue status maintenance ----------
-- Daily sweep (scheduled in the next migration alongside invoice reminders)
-- for invoices that passed their due date without ever getting a payment
-- (the payments trigger above only re-evaluates 'overdue' on a payment event).
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.invoices
  SET status = 'overdue'
  WHERE status IN ('sent', 'partially_paid')
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_invoices() FROM PUBLIC, anon, authenticated;
