import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const BUCKET = "case-documents";

async function requireClientRole(supabase: SupabaseClient<Database>, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile?.is_active || profile.role !== "client") {
    throw new Error("Client portal access required.");
  }
  return profile;
}

export interface PortalCaseRow {
  id: string;
  case_ref: string | null;
  title: string;
  case_type: string | null;
  status: string | null;
  health: string | null;
  opened_at: string | null;
  closed_at: string | null;
}

export interface PortalHearingRow {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  case_id: string | null;
  case_title: string | null;
  case_ref: string | null;
}

export interface PortalDocumentRow {
  id: string;
  title: string;
  doc_type: string | null;
  case_id: string | null;
  case_title: string | null;
  case_ref: string | null;
  can_download: boolean;
  shared_at: string;
}

export interface PortalHome {
  clientName: string | null;
  cases: PortalCaseRow[];
  hearings: PortalHearingRow[];
  documents: PortalDocumentRow[];
}

/**
 * Client-scoped portal home. RLS limits cases, hearings, and shared documents;
 * this handler additionally requires the client role.
 */
export const getPortalHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalHome> => {
    const { supabase, userId } = context;
    const profile = await requireClientRole(supabase, userId);

    const { data: client } = await supabase
      .from("clients")
      .select("id, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: cases, error: casesError } = await supabase
      .from("cases")
      .select("id, case_ref, title, case_type, status, health, opened_at, closed_at")
      .order("opened_at", { ascending: false });
    if (casesError) throw new Error(casesError.message);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data: hearings, error: hearingsError } = await supabase
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, location, case_id")
      .eq("event_type", "hearing")
      .gte("starts_at", startOfToday.toISOString())
      .order("starts_at", { ascending: true })
      .limit(20);
    if (hearingsError) throw new Error(hearingsError.message);

    const caseById = new Map((cases ?? []).map((c) => [c.id, c]));

    const { data: shares, error: sharesError } = await supabase
      .from("document_shares")
      .select("document_id, can_download, created_at")
      .eq("shared_with", userId)
      .order("created_at", { ascending: false });
    if (sharesError) throw new Error(sharesError.message);

    const docIds = (shares ?? []).map((s) => s.document_id);
    let documents: PortalDocumentRow[] = [];
    if (docIds.length > 0) {
      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, title, doc_type, case_id")
        .in("id", docIds);
      if (docsError) throw new Error(docsError.message);

      const shareByDoc = new Map((shares ?? []).map((s) => [s.document_id, s]));
      documents = (docs ?? []).map((d) => {
        const share = shareByDoc.get(d.id);
        const c = d.case_id ? caseById.get(d.case_id) : undefined;
        return {
          id: d.id,
          title: d.title ?? "Untitled",
          doc_type: d.doc_type,
          case_id: d.case_id,
          case_title: c?.title ?? null,
          case_ref: c?.case_ref ?? null,
          can_download: Boolean(share?.can_download),
          shared_at: share?.created_at ?? "",
        };
      });
    }

    return {
      clientName: client?.full_name ?? profile.full_name,
      cases: (cases ?? []) as PortalCaseRow[],
      hearings: (hearings ?? []).map((h) => {
        const c = h.case_id ? caseById.get(h.case_id) : undefined;
        return {
          id: h.id,
          title: h.title,
          starts_at: h.starts_at,
          ends_at: h.ends_at,
          location: h.location,
          case_id: h.case_id,
          case_title: c?.title ?? null,
          case_ref: c?.case_ref ?? null,
        };
      }),
      documents,
    };
  });

export const getPortalCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("A matter id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<PortalCaseRow> => {
    const { supabase, userId } = context;
    await requireClientRole(supabase, userId);

    const { data: c, error } = await supabase
      .from("cases")
      .select("id, case_ref, title, case_type, status, health, opened_at, closed_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Matter not found.");
    return c as PortalCaseRow;
  });

/**
 * Signed download URL for a document explicitly shared with the client.
 * RLS + share can_download gate both apply.
 */
export const getPortalDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    return { documentId: input.documentId };
  })
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { supabase, userId } = context;
    await requireClientRole(supabase, userId);

    const { data: share, error: shareError } = await supabase
      .from("document_shares")
      .select("can_download")
      .eq("document_id", data.documentId)
      .eq("shared_with", userId)
      .maybeSingle();
    if (shareError) throw new Error(shareError.message);
    if (!share) throw new Error("Document is not shared with you.");
    if (!share.can_download) throw new Error("Download is not permitted for this document.");

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("file_path, current_version")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docError) throw new Error(docError.message);
    if (!doc) throw new Error("Document not found.");

    let filePath = doc.file_path ?? null;
    if (!filePath && doc.current_version != null) {
      const { data: version, error: versionError } = await supabase
        .from("document_versions")
        .select("file_path")
        .eq("document_id", data.documentId)
        .eq("version_number", doc.current_version)
        .maybeSingle();
      if (versionError) throw new Error(versionError.message);
      filePath = version?.file_path ?? null;
    }
    if (!filePath) {
      const { data: latest, error: latestError } = await supabase
        .from("document_versions")
        .select("file_path")
        .eq("document_id", data.documentId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw new Error(latestError.message);
      filePath = latest?.file_path ?? null;
    }
    if (!filePath) throw new Error("No file is available for this document.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60);
    if (signedError) throw new Error(signedError.message);
    if (!signed?.signedUrl) throw new Error("Could not create download link.");

    return { url: signed.signedUrl };
  });

export interface PortalInvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  case_title: string | null;
  case_ref: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  amount_paid: number;
}

/** Invoices for the logged-in client's own matters. RLS already excludes drafts. */
export const getPortalInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalInvoiceRow[]> => {
    const { supabase, userId } = context;
    await requireClientRole(supabase, userId);

    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, amount_paid, cases(title, case_ref)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      status: r.status,
      case_title: (r.cases as { title: string | null } | null)?.title ?? null,
      case_ref: (r.cases as { case_ref: string | null } | null)?.case_ref ?? null,
      issue_date: r.issue_date,
      due_date: r.due_date,
      total: r.total,
      amount_paid: r.amount_paid,
    }));
  });

export interface PortalInvoiceLineItem {
  id: string;
  description: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
}

export interface PortalInvoiceDetail extends PortalInvoiceRow {
  line_items: PortalInvoiceLineItem[];
}

/** Read-only invoice detail for the client portal. No payment action — staff record payments manually. */
export const getPortalInvoiceDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoiceId: string }) => {
    if (!input?.invoiceId) throw new Error("An invoice id is required.");
    return { invoiceId: input.invoiceId };
  })
  .handler(async ({ data, context }): Promise<PortalInvoiceDetail> => {
    const { supabase, userId } = context;
    await requireClientRole(supabase, userId);

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, amount_paid, cases(title, case_ref)")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found.");

    const { data: lineItems, error: lineItemsError } = await supabase
      .from("invoice_line_items")
      .select("id, description, quantity, rate, amount")
      .eq("invoice_id", data.invoiceId)
      .order("sort_order", { ascending: true });
    if (lineItemsError) throw new Error(lineItemsError.message);

    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      case_title: (invoice.cases as { title: string | null } | null)?.title ?? null,
      case_ref: (invoice.cases as { case_ref: string | null } | null)?.case_ref ?? null,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total: invoice.total,
      amount_paid: invoice.amount_paid,
      line_items: lineItems ?? [],
    };
  });
