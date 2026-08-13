import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BUCKET,
  mockMalwareScan,
  uploadToCaseDocuments,
} from "@/lib/documents.functions";

export interface ExpenseRow {
  id: string;
  case_id: string;
  incurred_by: string | null;
  incurred_by_name: string | null;
  expense_date: string;
  expense_type: string;
  description: string;
  amount: number;
  receipt_path: string | null;
  status: string;
}

const RECEIPT_ALLOWED: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  pdf: ["application/pdf"],
};

/** List expenses logged against a matter, newest first. */
export const getCaseExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<ExpenseRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("expenses")
      .select(
        "id, case_id, incurred_by, expense_date, expense_type, description, amount, receipt_path, status, profiles!expenses_incurred_by_fkey(full_name)",
      )
      .eq("case_id", data.caseId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      case_id: r.case_id,
      incurred_by: r.incurred_by,
      incurred_by_name: (r.profiles as { full_name: string | null } | null)?.full_name ?? null,
      expense_date: r.expense_date,
      expense_type: r.expense_type,
      description: r.description,
      amount: r.amount,
      receipt_path: r.receipt_path,
      status: r.status,
    }));
  });

/**
 * Log an expense against a matter, optionally with a receipt photo. FormData
 * so the file can ride along, mirroring uploadDocument. Receipts land in the
 * same case-documents bucket as other matter files (already RLS-scoped per
 * case id folder prefix), under ${caseId}/receipts/.
 */
export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data.");
    const caseId = data.get("caseId");
    const expenseType = data.get("expenseType");
    const description = data.get("description");
    const amount = data.get("amount");
    const expenseDate = data.get("expenseDate");
    const file = data.get("file");

    if (typeof caseId !== "string" || !caseId) throw new Error("A matter id is required.");
    if (typeof expenseType !== "string" || (expenseType !== "hard_cost" && expenseType !== "soft_cost")) {
      throw new Error("A valid expense type is required.");
    }
    const validExpenseType: "hard_cost" | "soft_cost" = expenseType;
    if (typeof description !== "string" || !description.trim()) {
      throw new Error("A description is required.");
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      throw new Error("Amount must be zero or greater.");
    }
    if (typeof expenseDate !== "string" || !expenseDate) {
      throw new Error("An expense date is required.");
    }

    return {
      caseId,
      expenseType: validExpenseType,
      description: description.trim(),
      amount: Math.round(amountNum * 100) / 100,
      expenseDate,
      file: file instanceof File && file.size > 0 ? file : null,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    const { data: access, error: accessError } = await supabase.rpc(
      "effective_case_access",
      { _case_id: data.caseId },
    );
    if (accessError) throw new Error(accessError.message);
    if (access !== "full") {
      throw new Error("You do not have permission to log expenses on this matter.");
    }

    let receiptPath: string | null = null;
    if (data.file) {
      const rawName = data.file.name || "receipt";
      const dotIdx = rawName.lastIndexOf(".");
      const ext = dotIdx >= 0 ? rawName.slice(dotIdx + 1).toLowerCase() : "";
      const allowedMimes = RECEIPT_ALLOWED[ext];
      if (!allowedMimes) {
        throw new Error("Unsupported receipt file type. Allowed: JPG, PNG, PDF.");
      }
      if (data.file.type && !allowedMimes.includes(data.file.type)) {
        throw new Error("File content does not match its extension.");
      }

      const bytes = new Uint8Array(await data.file.arrayBuffer());
      const isMalware = await mockMalwareScan(bytes, rawName);
      if (isMalware) {
        throw new Error("Upload rejected: Malware detected by security scan.");
      }

      receiptPath = `${data.caseId}/receipts/${crypto.randomUUID()}.${ext}`;
      await uploadToCaseDocuments(receiptPath, bytes, allowedMimes[0]);
    }

    const { data: row, error } = await supabase
      .from("expenses")
      .insert({
        case_id: data.caseId,
        incurred_by: userId,
        expense_date: data.expenseDate,
        expense_type: data.expenseType,
        description: data.description,
        amount: data.amount,
        receipt_path: receiptPath,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** Edit an unbilled expense. Billed expenses are frozen — void the invoice to unlock. */
export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    id: string;
    expenseDate?: string;
    expenseType?: string;
    description?: string;
    amount?: number;
  }) => {
    if (!input?.id) throw new Error("An expense id is required.");
    const update: { expense_date?: string; expense_type?: "hard_cost" | "soft_cost"; description?: string; amount?: number } = {};
    if (input.expenseDate) update.expense_date = input.expenseDate;
    if (input.expenseType) {
      const expenseType = input.expenseType;
      if (expenseType !== "hard_cost" && expenseType !== "soft_cost") {
        throw new Error("A valid expense type is required.");
      }
      update.expense_type = expenseType;
    }
    if (input.description != null) {
      if (!input.description.trim()) throw new Error("A description is required.");
      update.description = input.description.trim();
    }
    if (input.amount != null) {
      const n = Number(input.amount);
      if (!Number.isFinite(n) || n < 0) throw new Error("Amount must be zero or greater.");
      update.amount = Math.round(n * 100) / 100;
    }
    if (Object.keys(update).length === 0) throw new Error("Nothing to update.");
    return { id: input.id, update };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("expenses")
      .update(data.update, { count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) {
      throw new Error("This expense has already been billed and can't be edited.");
    }
  });

/** Delete an unbilled expense. Billed expenses are frozen — void the invoice to unlock. */
export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("An expense id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("expenses")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) {
      throw new Error("This expense has already been billed and can't be deleted.");
    }
  });

/** Short-lived signed URL to view/download an expense receipt. */
export const getExpenseReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { expenseId: string }) => {
    if (!input?.expenseId) throw new Error("An expense id is required.");
    return { expenseId: input.expenseId };
  })
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { supabase } = context;
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("receipt_path")
      .eq("id", data.expenseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!expense?.receipt_path) throw new Error("No receipt is attached to this expense.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(expense.receipt_path, 120);
    if (signedError) throw new Error(signedError.message);
    if (!signed?.signedUrl) throw new Error("Could not create a view link.");
    return { url: signed.signedUrl };
  });
