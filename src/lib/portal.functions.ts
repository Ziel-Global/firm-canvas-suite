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

    const nowIso = new Date().toISOString();
    const { data: hearings, error: hearingsError } = await supabase
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, location, case_id")
      .eq("event_type", "hearing")
      .gte("starts_at", nowIso)
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
    if (!input?.id) throw new Error("A case id is required.");
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
    if (!c) throw new Error("Case not found.");
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

    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60);
    if (signedError) throw new Error(signedError.message);
    if (!signed?.signedUrl) throw new Error("Could not create download link.");

    return { url: signed.signedUrl };
  });
