import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
  method: string;
  paid_at: string;
  note: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

const PAYMENT_METHODS = ["check", "wire", "cash", "card_offline", "other"] as const;

/** Record a manual payment against an invoice. Admin/lead only — no payment processor is wired up. */
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoiceId: string; amount: number; method: string; paidAt: string; note?: string }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
    if (!PAYMENT_METHODS.includes(input.method as (typeof PAYMENT_METHODS)[number])) {
      throw new Error("A valid payment method is required.");
    }
    if (!input?.paidAt) throw new Error("A payment date is required.");
    return {
      invoiceId: input.invoiceId,
      amount: Math.round(amount * 100) / 100,
      method: input.method,
      paidAt: input.paidAt,
      note: input.note?.trim() || null,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("payments")
      .insert({
        invoice_id: data.invoiceId,
        amount: data.amount,
        method: data.method,
        paid_at: data.paidAt,
        note: data.note,
        recorded_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** Payments recorded against an invoice, newest first. */
export const getInvoicePayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoiceId: string }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    return { invoiceId: input.invoiceId };
  })
  .handler(async ({ data, context }): Promise<PaymentRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, method, paid_at, note, created_at, profiles(full_name)")
      .eq("invoice_id", data.invoiceId)
      .order("paid_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      amount: r.amount,
      method: r.method,
      paid_at: r.paid_at,
      note: r.note,
      recorded_by_name: (r.profiles as { full_name: string | null } | null)?.full_name ?? null,
      created_at: r.created_at,
    }));
  });

/** Correct a mis-entered payment. Admin-only; the invoice's amount_paid/status recalculates via trigger. */
export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("A payment id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("payments")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Payment not found.");
  });
