import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type FeeStructure = Database["public"]["Enums"]["fee_structure_type"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export interface UnbilledTimeEntry {
  id: string;
  description: string;
  entry_date: string;
  duration_minutes: number;
  rate: number | null;
  timekeeper_name: string | null;
}

export interface UnbilledExpense {
  id: string;
  description: string;
  expense_date: string;
  amount: number;
}

export interface UnbilledSummary {
  case_id: string;
  case_title: string;
  fee_structure: FeeStructure;
  default_hourly_rate: number | null;
  flat_fee_amount: number | null;
  contingency_percentage: number | null;
  subscription_amount: number | null;
  subscription_period: string | null;
  time_entries: UnbilledTimeEntry[];
  expenses: UnbilledExpense[];
}

export interface InvoiceLineItemRow {
  id: string;
  source_type: string;
  time_entry_id: string | null;
  expense_id: string | null;
  description: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
  sort_order: number;
}

export interface InvoiceRow {
  id: string;
  case_id: string;
  case_title: string | null;
  case_ref: string | null;
  client_id: string | null;
  client_name: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  fee_structure_snapshot: FeeStructure;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface InvoiceDetail extends InvoiceRow {
  line_items: InvoiceLineItemRow[];
}

/** Unbilled time + expenses for a matter, plus its fee-structure config, for the "Generate invoice" preview. */
export const getUnbilledSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<UnbilledSummary> => {
    const { supabase } = context;

    const { data: caseRow, error: caseError } = await supabase
      .from("cases")
      .select(
        "id, title, fee_structure, default_hourly_rate, flat_fee_amount, contingency_percentage, subscription_amount, subscription_period",
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseError) throw new Error(caseError.message);
    if (!caseRow) throw new Error("Matter not found.");

    const [entriesRes, expensesRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select(
          "id, description, entry_date, duration_minutes, rate, profiles!time_entries_timekeeper_id_fkey(full_name)",
        )
        .eq("case_id", data.caseId)
        .eq("status", "unbilled")
        .eq("is_billable", true)
        .not("duration_minutes", "is", null)
        .order("entry_date", { ascending: true }),
      supabase
        .from("expenses")
        .select("id, description, expense_date, amount")
        .eq("case_id", data.caseId)
        .eq("status", "unbilled")
        .order("expense_date", { ascending: true }),
    ]);
    if (entriesRes.error) throw new Error(entriesRes.error.message);
    if (expensesRes.error) throw new Error(expensesRes.error.message);

    return {
      case_id: caseRow.id,
      case_title: caseRow.title,
      fee_structure: caseRow.fee_structure,
      default_hourly_rate: caseRow.default_hourly_rate,
      flat_fee_amount: caseRow.flat_fee_amount,
      contingency_percentage: caseRow.contingency_percentage,
      subscription_amount: caseRow.subscription_amount,
      subscription_period: caseRow.subscription_period,
      time_entries: (entriesRes.data ?? []).map((r) => ({
        id: r.id,
        description: r.description,
        entry_date: r.entry_date,
        duration_minutes: r.duration_minutes as number,
        rate: r.rate,
        timekeeper_name: (r.profiles as { full_name: string | null } | null)?.full_name ?? null,
      })),
      expenses: (expensesRes.data ?? []).map((r) => ({
        id: r.id,
        description: r.description,
        expense_date: r.expense_date,
        amount: r.amount,
      })),
    };
  });

/**
 * Build an editable draft invoice from every unbilled time entry + expense on
 * a matter, per its fee structure. Does not touch source-row status — that
 * only happens when the draft is sent (sendInvoice), so nothing is double-
 * billed and a discarded draft costs nothing.
 */
export const generateInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; settlementAmount?: number }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return {
      caseId: input.caseId,
      settlementAmount:
        input.settlementAmount != null && Number.isFinite(Number(input.settlementAmount))
          ? Number(input.settlementAmount)
          : undefined,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    const { data: access, error: accessError } = await supabase.rpc(
      "effective_case_access",
      { _case_id: data.caseId },
    );
    if (accessError) throw new Error(accessError.message);
    const { data: role } = await supabase.rpc("current_role");
    const isAdmin = role === "super_admin" || role === "admin";
    if (!isAdmin && access !== "full") {
      throw new Error("You do not have permission to invoice this matter.");
    }

    const { data: caseRow, error: caseError } = await supabase
      .from("cases")
      .select(
        "id, client_id, fee_structure, flat_fee_amount, contingency_percentage, subscription_amount, subscription_period",
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseError) throw new Error(caseError.message);
    if (!caseRow) throw new Error("Matter not found.");

    const { data: entries, error: entriesError } = await supabase
      .from("time_entries")
      .select("id, description, duration_minutes, rate")
      .eq("case_id", data.caseId)
      .eq("status", "unbilled")
      .eq("is_billable", true)
      .not("duration_minutes", "is", null);
    if (entriesError) throw new Error(entriesError.message);

    const { data: expenses, error: expensesError } = await supabase
      .from("expenses")
      .select("id, description, amount")
      .eq("case_id", data.caseId)
      .eq("status", "unbilled");
    if (expensesError) throw new Error(expensesError.message);

    type DraftLineItem = {
      source_type: string;
      time_entry_id: string | null;
      expense_id: string | null;
      description: string;
      quantity: number | null;
      rate: number | null;
      amount: number;
      sort_order: number;
    };
    const lineItems: DraftLineItem[] = [];
    let sortOrder = 0;

    if (caseRow.fee_structure === "hourly") {
      for (const e of entries ?? []) {
        const hours = Math.round(((e.duration_minutes ?? 0) / 60) * 100) / 100;
        const rate = e.rate ?? 0;
        lineItems.push({
          source_type: "time_entry",
          time_entry_id: e.id,
          expense_id: null,
          description: e.description,
          quantity: hours,
          rate,
          amount: Math.round(hours * rate * 100) / 100,
          sort_order: sortOrder++,
        });
      }
    } else if (caseRow.fee_structure === "flat") {
      if (caseRow.flat_fee_amount == null) {
        throw new Error("Set a flat fee amount on this matter before generating an invoice.");
      }
      lineItems.push({
        source_type: "flat_fee",
        time_entry_id: null,
        expense_id: null,
        description: "Flat fee",
        quantity: 1,
        rate: caseRow.flat_fee_amount,
        amount: caseRow.flat_fee_amount,
        sort_order: sortOrder++,
      });
    } else if (caseRow.fee_structure === "subscription") {
      if (caseRow.subscription_amount == null) {
        throw new Error("Set a subscription amount on this matter before generating an invoice.");
      }
      const period = caseRow.subscription_period?.trim() || "period";
      lineItems.push({
        source_type: "subscription_fee",
        time_entry_id: null,
        expense_id: null,
        description: `Subscription fee (${period})`,
        quantity: 1,
        rate: caseRow.subscription_amount,
        amount: caseRow.subscription_amount,
        sort_order: sortOrder++,
      });
    } else if (caseRow.fee_structure === "contingency") {
      if (caseRow.contingency_percentage == null) {
        throw new Error("Set a contingency percentage on this matter before generating an invoice.");
      }
      if (data.settlementAmount == null || data.settlementAmount <= 0) {
        throw new Error("Enter the settlement/recovery amount to calculate the contingency fee.");
      }
      const amount = Math.round(data.settlementAmount * (caseRow.contingency_percentage / 100) * 100) / 100;
      lineItems.push({
        source_type: "contingency_fee",
        time_entry_id: null,
        expense_id: null,
        description: `Contingency fee (${caseRow.contingency_percentage}% of ${data.settlementAmount.toLocaleString()})`,
        quantity: 1,
        rate: null,
        amount,
        sort_order: sortOrder++,
      });
    }

    for (const x of expenses ?? []) {
      lineItems.push({
        source_type: "expense",
        time_entry_id: null,
        expense_id: x.id,
        description: x.description,
        quantity: 1,
        rate: x.amount,
        amount: x.amount,
        sort_order: sortOrder++,
      });
    }

    if (lineItems.length === 0) {
      throw new Error("Nothing to invoice — no unbilled time or expenses on this matter.");
    }

    const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;

    const { data: invoiceNumber, error: numError } = await supabase.rpc("next_invoice_number");
    if (numError) throw new Error(numError.message);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        case_id: data.caseId,
        client_id: caseRow.client_id,
        invoice_number: invoiceNumber,
        fee_structure_snapshot: caseRow.fee_structure,
        subtotal,
        total: subtotal,
        created_by: userId,
      })
      .select("id")
      .single();
    if (invoiceError) throw new Error(invoiceError.message);

    const { error: lineItemsError } = await supabase.from("invoice_line_items").insert(
      lineItems.map((li) => ({ ...li, invoice_id: invoice.id })),
    );
    if (lineItemsError) throw new Error(lineItemsError.message);

    return { id: invoice.id };
  });

/** Edit a draft invoice's line items and recompute totals. Draft-only. */
export const updateInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    invoiceId: string;
    lineItems: { id?: string; description: string; quantity: number | null; rate: number | null; amount: number; sortOrder: number }[];
    notes?: string;
  }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
      throw new Error("An invoice needs at least one line item.");
    }
    return {
      invoiceId: input.invoiceId,
      lineItems: input.lineItems.map((li) => ({
        id: li.id,
        description: li.description.trim(),
        quantity: li.quantity,
        rate: li.rate,
        amount: Math.round(Number(li.amount) * 100) / 100,
        sortOrder: li.sortOrder,
      })),
      notes: input.notes?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message);
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be edited.");

    // Replace the full line-item set — simplest correct approach for a small,
    // fully-editable draft (removed source entries stay unbilled either way).
    const { error: deleteError } = await supabase
      .from("invoice_line_items")
      .delete()
      .eq("invoice_id", data.invoiceId);
    if (deleteError) throw new Error(deleteError.message);

    const kept = data.lineItems.filter((li) => li.amount !== 0 || li.description);
    if (kept.length === 0) throw new Error("An invoice needs at least one line item.");

    const { error: insertError } = await supabase.from("invoice_line_items").insert(
      kept.map((li) => ({
        invoice_id: data.invoiceId,
        source_type: "custom",
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.amount,
        sort_order: li.sortOrder,
      })),
    );
    if (insertError) throw new Error(insertError.message);

    const subtotal = Math.round(kept.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
    const update: Database["public"]["Tables"]["invoices"]["Update"] = {
      subtotal,
      total: subtotal,
    };
    if (data.notes !== undefined) update.notes = data.notes;

    const { error: updateError } = await supabase
      .from("invoices")
      .update(update)
      .eq("id", data.invoiceId);
    if (updateError) throw new Error(updateError.message);
  });

/** Finalize a draft: locks in due date, bills every referenced time entry/expense, emails the client. */
export const sendInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoiceId: string }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    return { invoiceId: input.invoiceId };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("send_invoice", { _invoice_id: data.invoiceId });
    if (error) throw new Error(error.message);

    // Best-effort client email — invoice is already sent regardless of outcome.
    try {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, due_date, case_id, cases(title), clients(email, full_name)")
        .eq("id", data.invoiceId)
        .maybeSingle();
      const client = invoice?.clients as { email: string | null; full_name: string | null } | null;
      const c = invoice?.cases as { title: string | null } | null;
      if (invoice && client?.email) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.functions.invoke("send-email", {
          body: {
            to: client.email,
            subject: `Invoice ${invoice.invoice_number} from your matter ${c?.title ?? ""}`,
            html: `<p>Hi ${client.full_name || "there"},</p><p>A new invoice <strong>${invoice.invoice_number}</strong> for <strong>${(invoice.total ?? 0).toLocaleString()}</strong> is ready${invoice.due_date ? `, due ${invoice.due_date}` : ""}.</p><p>Sign in to the client portal to view the full breakdown and payment details.</p>`,
          },
        });
      }
    } catch (e) {
      console.error("Failed to send invoice email:", e);
    }
  });

/** Retract a sent/overdue invoice, releasing its time entries/expenses back to unbilled. */
export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoiceId: string; reason?: string }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    return { invoiceId: input.invoiceId, reason: input.reason?.trim() || undefined };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("void_invoice", {
      _invoice_id: data.invoiceId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
  });

function toInvoiceRow(r: {
  id: string;
  case_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  fee_structure_snapshot: FeeStructure;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
  client_id: string | null;
  cases: { title: string | null; case_ref: string | null } | null;
  clients: { full_name: string | null } | null;
}): InvoiceRow {
  return {
    id: r.id,
    case_id: r.case_id,
    case_title: r.cases?.title ?? null,
    case_ref: r.cases?.case_ref ?? null,
    client_id: r.client_id,
    client_name: r.clients?.full_name ?? null,
    invoice_number: r.invoice_number,
    status: r.status,
    fee_structure_snapshot: r.fee_structure_snapshot,
    issue_date: r.issue_date,
    due_date: r.due_date,
    subtotal: r.subtotal,
    total: r.total,
    amount_paid: r.amount_paid,
    notes: r.notes,
    sent_at: r.sent_at,
    created_at: r.created_at,
  };
}

const INVOICE_SELECT =
  "id, case_id, client_id, invoice_number, status, fee_structure_snapshot, issue_date, due_date, subtotal, total, amount_paid, notes, sent_at, created_at, cases(title, case_ref), clients(full_name)";

/** Invoices for a single matter, newest first. */
export const getCaseInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<InvoiceRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("invoices")
      .select(INVOICE_SELECT)
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toInvoiceRow);
  });

/** Full invoice detail with line items. */
export const getInvoiceDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoiceId: string }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    return { invoiceId: input.invoiceId };
  })
  .handler(async ({ data, context }): Promise<InvoiceDetail> => {
    const { supabase } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(INVOICE_SELECT)
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found.");

    const { data: lineItems, error: lineItemsError } = await supabase
      .from("invoice_line_items")
      .select("id, source_type, time_entry_id, expense_id, description, quantity, rate, amount, sort_order")
      .eq("invoice_id", data.invoiceId)
      .order("sort_order", { ascending: true });
    if (lineItemsError) throw new Error(lineItemsError.message);

    return {
      ...toInvoiceRow(invoice),
      line_items: lineItems ?? [],
    };
  });

/** Firm-wide invoice list for the /billing route. Admin-only. */
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    status?: InvoiceStatus;
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => input ?? {})
  .handler(async ({ data, context }): Promise<InvoiceRow[]> => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    if (role !== "super_admin" && role !== "admin") {
      throw new Error("Only admins can view the firm-wide invoice list.");
    }

    let query = supabase.from("invoices").select(INVOICE_SELECT).order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", data.status);
    if (data.clientId) query = query.eq("client_id", data.clientId);
    if (data.dateFrom) query = query.gte("created_at", data.dateFrom);
    if (data.dateTo) query = query.lte("created_at", data.dateTo);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toInvoiceRow);
  });

export interface CaseBillingSettings {
  fee_structure: FeeStructure;
  default_hourly_rate: number | null;
  flat_fee_amount: number | null;
  contingency_percentage: number | null;
  subscription_amount: number | null;
  subscription_period: string | null;
}

/** A matter's billing configuration, for the Billing tab's settings panel. */
export const getCaseBillingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseBillingSettings> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("cases")
      .select(
        "fee_structure, default_hourly_rate, flat_fee_amount, contingency_percentage, subscription_amount, subscription_period",
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Matter not found.");
    return row;
  });

/** Admins set how a matter is billed: hourly rate, flat fee, contingency %, or subscription. */
export const updateCaseBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    caseId: string;
    feeStructure: FeeStructure;
    defaultHourlyRate?: number | null;
    flatFeeAmount?: number | null;
    contingencyPercentage?: number | null;
    subscriptionAmount?: number | null;
    subscriptionPeriod?: string | null;
  }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    const validTypes: FeeStructure[] = ["hourly", "flat", "contingency", "subscription"];
    if (!validTypes.includes(input.feeStructure)) {
      throw new Error("A valid fee structure is required.");
    }
    return {
      caseId: input.caseId,
      feeStructure: input.feeStructure,
      defaultHourlyRate: input.defaultHourlyRate ?? null,
      flatFeeAmount: input.flatFeeAmount ?? null,
      contingencyPercentage: input.contingencyPercentage ?? null,
      subscriptionAmount: input.subscriptionAmount ?? null,
      subscriptionPeriod: input.subscriptionPeriod?.trim() || null,
    };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    if (role !== "super_admin" && role !== "admin") {
      throw new Error("Only admins can change how a matter is billed.");
    }

    const { error } = await supabase
      .from("cases")
      .update({
        fee_structure: data.feeStructure,
        default_hourly_rate: data.defaultHourlyRate,
        flat_fee_amount: data.flatFeeAmount,
        contingency_percentage: data.contingencyPercentage,
        subscription_amount: data.subscriptionAmount,
        subscription_period: data.subscriptionPeriod,
      })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);
  });
