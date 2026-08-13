import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export const BUCKET = "case-documents";

export async function ensureCaseDocumentsBucket() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  if (buckets?.some((b) => b.id === BUCKET || b.name === BUCKET)) return;

  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 52428800,
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "text/plain",
    ],
  });
  // Ignore race where another request created it first.
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }
}

/**
 * Upload bytes with the service-role client. Storage RLS on this project rejects
 * authenticated inserts even when effective_case_access is full; authorization is
 * enforced by the caller before invoking this helper.
 */
export async function uploadToCaseDocuments(
  objectName: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureCaseDocumentsBucket();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectName, bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);
}

async function removeCaseDocumentObjects(objectNames: string[]) {
  if (!objectNames.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from(BUCKET).remove(objectNames);
}

async function assertCanUploadToCase(
  supabase: SupabaseClient<Database>,
  caseId: string,
  folderId: string,
) {
  const { data: access, error: accessError } = await supabase.rpc(
    "effective_case_access",
    { _case_id: caseId },
  );
  if (accessError) throw new Error(accessError.message);
  if (access !== "full") {
    throw new Error("You do not have permission to upload documents to this matter.");
  }

  const { data: folder, error: folderError } = await supabase
    .from("document_folders")
    .select("id, code")
    .eq("id", folderId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (folderError) throw new Error(folderError.message);
  if (!folder) throw new Error("That document folder was not found for this matter.");
}

/**
 * Allowed upload types. Maps a normalised file extension to its MIME type.
 * Anything outside this list (notably executables) is rejected.
 */
const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
};

const DOC_TYPE_BY_EXT: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  jpg: "Image",
  jpeg: "Image",
  png: "Image",
};

export interface CaseFolder {
  id: string;
  code: string;
  name: string;
}

export type DocumentVisibilityMode = "open" | "allowlist" | "admin_only";

export type StaffCaseRole =
  | "senior_lawyer"
  | "junior_lawyer"
  | "support"
  | "admin"
  | "super_admin";

export interface CaseTeamMember {
  userId: string;
  fullName: string;
  role: StaffCaseRole | string;
  isLead: boolean;
}

export interface DocumentVisibilityRule {
  id: string;
  effect: "allow" | "deny";
  subjectType: "user" | "role";
  userId: string | null;
  role: string | null;
  userName: string | null;
}

export interface DocumentVisibilityState {
  mode: DocumentVisibilityMode;
  rules: DocumentVisibilityRule[];
  team: CaseTeamMember[];
}

export interface CaseDocument {
  id: string;
  folder_id: string | null;
  title: string;
  case_id?: string | null;
  case_title?: string; // Optional, added for global search
  doc_type: string | null;
  current_version: number | null;
  is_locked: boolean;
  is_archived: boolean;
  approval_status: 'draft' | 'in_review' | 'approved';
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
  /** True when this document is shared with the case's linked portal client. */
  shared_with_client: boolean;
  /** Who may see this document beyond folder rules. */
  visibility_mode: DocumentVisibilityMode;
}

// --- MALWARE SCANNING HOOK ---
// TODO: Connect to a real scanning service (e.g. AWS Macie, ClamAV, or VirusTotal API)
export async function mockMalwareScan(bytes: Uint8Array, fileName: string): Promise<boolean> {
  // Mock logic: reject if filename contains 'eicar' or 'malware'
  const lower = fileName.toLowerCase();
  if (lower.includes('eicar') || lower.includes('malware')) {
    return true;
  }
  return false;
}
// -----------------------------

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_number: number;
  note: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  uploaded_at: string;
  file_path: string | null;
  is_current: boolean;
}

/**
 * List the document folders for a case that the caller may access.
 * RLS on `document_folders` scopes which folders each role can see.
 */
export const getCaseFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseFolder[]> => {
    const { supabase } = context;
    const { data: folders, error } = await supabase
      .from("document_folders")
      .select("id, code, name")
      .eq("case_id", data.caseId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return (folders ?? []) as CaseFolder[];
  });

/**
 * List documents within a folder of a case. RLS on `documents` and
 * `document_folders` enforces per-role folder access.
 */
export const getFolderDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; folderId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.folderId) throw new Error("A folder id is required.");
    return { caseId: input.caseId, folderId: input.folderId };
  })
  .handler(async ({ data, context }): Promise<CaseDocument[]> => {
    const { supabase } = context;

    const baseSelect =
      "id, folder_id, title, doc_type, current_version, is_locked, is_archived, approval_status, submitted_at, approved_at, approved_by, uploaded_by, created_at";

    let docs: Array<Record<string, unknown>> | null = null;
    {
      const first = await supabase
        .from("documents")
        .select(`${baseSelect}, visibility_mode`)
        .eq("case_id", data.caseId)
        .eq("folder_id", data.folderId)
        .order("created_at", { ascending: false });
      if (
        first.error &&
        /visibility_mode|document_visibility/i.test(first.error.message)
      ) {
        const fallback = await supabase
          .from("documents")
          .select(baseSelect)
          .eq("case_id", data.caseId)
          .eq("folder_id", data.folderId)
          .order("created_at", { ascending: false });
        if (fallback.error) throw new Error(fallback.error.message);
        docs = (fallback.data ?? []) as Array<Record<string, unknown>>;
      } else if (first.error) {
        throw new Error(first.error.message);
      } else {
        docs = (first.data ?? []) as Array<Record<string, unknown>>;
      }
    }
    if (!docs || docs.length === 0) return [];

    const uploaderIds = Array.from(
      new Set(
        docs
          .map((d) => d.uploaded_by as string | null)
          .filter((v): v is string => Boolean(v)),
      ),
    );

    const nameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uploaderIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string) ?? "");
      }
    }

    const sharedIds = new Set<string>();
    const { data: caseRow } = await supabase
      .from("cases")
      .select("client_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseRow?.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("user_id")
        .eq("id", caseRow.client_id)
        .maybeSingle();
      if (client?.user_id) {
        const { data: shares } = await supabase
          .from("document_shares")
          .select("document_id")
          .eq("shared_with", client.user_id)
          .in(
            "document_id",
            docs.map((d) => d.id as string),
          );
        for (const s of shares ?? []) {
          if (s.document_id) sharedIds.add(s.document_id);
        }
      }
    }

    return docs.map((d) => ({
      id: d.id as string,
      folder_id: (d.folder_id as string | null) ?? null,
      title: (d.title as string) ?? "Untitled",
      doc_type: (d.doc_type as string | null) ?? null,
      current_version: (d.current_version as number | null) ?? null,
      is_locked: Boolean(d.is_locked),
      is_archived: Boolean(d.is_archived),
      approval_status:
        (d.approval_status as CaseDocument["approval_status"]) ?? "draft",
      submitted_at: (d.submitted_at as string) ?? null,
      approved_at: (d.approved_at as string) ?? null,
      approved_by: (d.approved_by as string) ?? null,
      uploaded_by: (d.uploaded_by as string | null) ?? null,
      uploader_name: d.uploaded_by
        ? (nameById.get(d.uploaded_by as string) ?? null)
        : null,
      created_at: d.created_at as string,
      shared_with_client: sharedIds.has(d.id as string),
      visibility_mode:
        (d.visibility_mode as DocumentVisibilityMode | undefined) ?? "open",
    }));
  });

/**
 * Version history for a single document.
 * Team members only see the current version unless they have a full case
 * access override; Super Admins see the complete history.
 */
export const getDocumentVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; documentId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.documentId) throw new Error("A document id is required.");
    return { caseId: input.caseId, documentId: input.documentId };
  })
  .handler(async ({ data, context }): Promise<DocumentVersionRow[]> => {
    const { supabase } = context;

    const { data: role } = await supabase.rpc("current_role");
    const { data: overrideLevel } = await supabase.rpc("case_override_level", {
      _case_id: data.caseId,
    });
    const canSeeHistory =
      (role as string) === "super_admin" || (overrideLevel as string) === "full";

    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, case_id, current_version")
      .eq("id", data.documentId)
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!document) throw new Error("Document not found.");

    const { data: versions, error } = await supabase
      .from("document_versions")
      .select("id, document_id, version_number, note, uploaded_by, uploaded_at, file_path")
      .eq("document_id", data.documentId)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (versions ?? []).filter(
      (version) => canSeeHistory || version.version_number === document.current_version,
    );

    const uploaderIds = Array.from(
      new Set(
        rows
          .map((version) => version.uploaded_by)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const nameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uploaderIds);
      for (const profile of profiles ?? []) {
        nameById.set(profile.id as string, (profile.full_name as string) ?? "");
      }
    }

    return rows.map((version) => ({
      id: version.id,
      document_id: version.document_id,
      version_number: version.version_number ?? 1,
      note: version.note,
      uploaded_by: version.uploaded_by,
      uploader_name: version.uploaded_by ? (nameById.get(version.uploaded_by) ?? null) : null,
      uploaded_at: version.uploaded_at,
      file_path: version.file_path,
      is_current: version.version_number === document.current_version,
    }));
  });

/**
 * Upload a file into a case folder. Stores the file in Storage, then creates a
 * `documents` row and an initial `document_versions` row (version 1).
 * Accepts PDF, DOCX, XLSX, JPG, PNG only; executables and other types rejected.
 */
export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data.");
    const caseId = data.get("caseId");
    const folderId = data.get("folderId");
    const documentId = data.get("documentId");
    const note = data.get("note");
    const file = data.get("file");
    if (typeof caseId !== "string" || !caseId) throw new Error("A matter id is required.");
    if (!(file instanceof File) || file.size === 0) throw new Error("A file is required.");
    return {
      caseId,
      folderId: typeof folderId === "string" && folderId ? folderId : null,
      documentId: typeof documentId === "string" && documentId ? documentId : null,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      file,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { caseId, file } = data;

    const { data: existingDocument, error: documentLookupError } = data.documentId
      ? await supabase
        .from("documents")
        .select("id, case_id, folder_id, current_version, uploaded_by")
        .eq("id", data.documentId)
        .eq("case_id", caseId)
        .maybeSingle()
      : { data: null, error: null };
    if (documentLookupError) throw new Error(documentLookupError.message);

    const folderId = existingDocument?.folder_id ?? data.folderId;
    if (!folderId) {
      throw new Error("A folder id is required.");
    }

    await assertCanUploadToCase(supabase, caseId, folderId);

    const isVersionUpload = Boolean(existingDocument);

    const rawName = file.name || "upload";
    const dotIdx = rawName.lastIndexOf(".");
    const ext = dotIdx >= 0 ? rawName.slice(dotIdx + 1).toLowerCase() : "";

    const allowedMimes = ALLOWED[ext];
    if (!allowedMimes) {
      throw new Error("Unsupported file type. Allowed: PDF, DOCX, XLSX, JPG, PNG.");
    }
    // Guard against mismatched/executable content masquerading as a doc type.
    if (file.type && !allowedMimes.includes(file.type)) {
      throw new Error("File content does not match its extension.");
    }

    let nextVersionNumber = 1;
    if (isVersionUpload) {
      const { data: latestVersion, error: latestVersionError } = await supabase
        .from("document_versions")
        .select("version_number")
        .eq("document_id", existingDocument!.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestVersionError) throw new Error(latestVersionError.message);
      nextVersionNumber =
        (latestVersion?.version_number ?? existingDocument?.current_version ?? 0) + 1;
    }
    const objectName = isVersionUpload
      ? `${caseId}/${folderId}/${existingDocument!.id}/v${nextVersionNumber}-${crypto.randomUUID()}.${ext}`
      : `${caseId}/${folderId}/${crypto.randomUUID()}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());

    // --- MALWARE SCANNING HOOK ---
    const isMalware = await mockMalwareScan(bytes, rawName);
    if (isMalware) {
      throw new Error("Upload rejected: Malware detected by security scan.");
    }
    // -----------------------------

    await uploadToCaseDocuments(objectName, bytes, allowedMimes[0]);

    const title = dotIdx >= 0 ? rawName.slice(0, dotIdx) : rawName;

    if (!isVersionUpload) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          case_id: caseId,
          folder_id: folderId,
          title,
          file_path: objectName,
          doc_type: DOC_TYPE_BY_EXT[ext],
          current_version: 1,
          uploaded_by: userId,
        })
        .select("id")
        .single();
      if (docError || !doc) {
        await removeCaseDocumentObjects([objectName]);
        throw new Error(docError?.message ?? "Failed to create document.");
      }

      const { error: versionError } = await supabase.from("document_versions").insert({
        document_id: doc.id,
        version_number: 1,
        file_path: objectName,
        uploaded_by: userId,
        note: data.note,
      });
      if (versionError) {
        await supabase.from("documents").delete().eq("id", doc.id);
        await removeCaseDocumentObjects([objectName]);
        throw new Error(versionError.message);
      }

      return { id: doc.id as string };
    }

    const { data: versionRow, error: versionInsertError } = await supabase
      .from("document_versions")
      .insert({
        document_id: existingDocument!.id,
        version_number: nextVersionNumber,
        file_path: objectName,
        uploaded_by: userId,
        note: data.note,
      })
      .select("id")
      .single();
    if (versionInsertError || !versionRow) {
      await removeCaseDocumentObjects([objectName]);
      throw new Error(versionInsertError?.message ?? "Failed to create document version.");
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        title: existingDocument ? undefined : title,
        file_path: objectName,
        current_version: nextVersionNumber,
        doc_type: DOC_TYPE_BY_EXT[ext],
        uploaded_by: userId,
      })
      .eq("id", existingDocument!.id);
    if (updateError) {
      await supabase.from("document_versions").delete().eq("id", versionRow.id);
      await removeCaseDocumentObjects([objectName]);
      throw new Error(updateError.message);
    }

    return { id: existingDocument!.id as string };
  });

/**
 * Resolve a short-lived signed URL so staff can view or download a document
 * they are permitted to read. Storage bytes are served via the service role
 * after RLS confirms document access (authenticated storage reads are blocked).
 */
export const getDocumentViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; documentId: string; versionId?: string | null }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.documentId) throw new Error("A document id is required.");
    return {
      caseId: input.caseId,
      documentId: input.documentId,
      versionId:
        typeof input.versionId === "string" && input.versionId
          ? input.versionId
          : null,
    };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ url: string; fileName: string; docType: string | null }> => {
      const { supabase } = context;

      const { data: readable, error: readableError } = await supabase.rpc(
        "can_read_document",
        { _doc_id: data.documentId },
      );
      if (readableError) throw new Error(readableError.message);
      if (!readable) throw new Error("You do not have permission to view this document.");

      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, case_id, title, doc_type, file_path, current_version")
        .eq("id", data.documentId)
        .eq("case_id", data.caseId)
        .maybeSingle();
      if (docError) throw new Error(docError.message);
      if (!doc) throw new Error("Document not found.");

      let filePath: string | null = null;
      let versionNumber = doc.current_version ?? 1;

      if (data.versionId) {
        const { data: version, error: versionError } = await supabase
          .from("document_versions")
          .select("file_path, version_number")
          .eq("id", data.versionId)
          .eq("document_id", data.documentId)
          .maybeSingle();
        if (versionError) throw new Error(versionError.message);
        if (!version) throw new Error("Document version not found.");
        filePath = version.file_path;
        versionNumber = version.version_number ?? versionNumber;
      } else {
        filePath = doc.file_path ?? null;
        if (!filePath && doc.current_version != null) {
          const { data: version, error: versionError } = await supabase
            .from("document_versions")
            .select("file_path, version_number")
            .eq("document_id", data.documentId)
            .eq("version_number", doc.current_version)
            .maybeSingle();
          if (versionError) throw new Error(versionError.message);
          filePath = version?.file_path ?? null;
          if (version?.version_number != null) versionNumber = version.version_number;
        }
        if (!filePath) {
          const { data: latest, error: latestError } = await supabase
            .from("document_versions")
            .select("file_path, version_number")
            .eq("document_id", data.documentId)
            .order("version_number", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestError) throw new Error(latestError.message);
          filePath = latest?.file_path ?? null;
          if (latest?.version_number != null) versionNumber = latest.version_number;
        }
      }

      if (!filePath) throw new Error("No file is available for this document.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error: signedError } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(filePath, 120);
      if (signedError) throw new Error(signedError.message);
      if (!signed?.signedUrl) throw new Error("Could not create a view link.");

      const ext = filePath.includes(".")
        ? filePath.slice(filePath.lastIndexOf("."))
        : "";
      const baseTitle = (doc.title ?? "document").replace(/[\\/:*?"<>|]+/g, "_");
      const fileName = `${baseTitle}-v${versionNumber}${ext}`;

      return {
        url: signed.signedUrl,
        fileName,
        docType: (doc.doc_type as string) ?? null,
      };
    },
  );

/**
 * Restore a prior document version.
 * Only Super Admins can perform this action.
 */
export const restoreDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; documentId: string; versionId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.documentId) throw new Error("A document id is required.");
    if (!input?.versionId) throw new Error("A version id is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.rpc("current_role");
    if ((role as string) !== "super_admin") {
      throw new Error("Only a Super Admin can restore a document version.");
    }

    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, case_id")
      .eq("id", data.documentId)
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!document) throw new Error("Document not found.");

    const { data: version, error: versionErr } = await supabase
      .from("document_versions")
      .select("id, document_id, version_number, file_path, uploaded_by")
      .eq("id", data.versionId)
      .eq("document_id", data.documentId)
      .maybeSingle();
    if (versionErr) throw new Error(versionErr.message);
    if (!version) throw new Error("Version not found.");

    const { error: updateErr } = await supabase
      .from("documents")
      .update({
        file_path: version.file_path,
        current_version: version.version_number,
        uploaded_by: version.uploaded_by,
      })
      .eq("id", document.id);
    if (updateErr) throw new Error(updateErr.message);

    const { error: logErr } = await supabase.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: "document_version_restored",
      detail: {
        document_id: data.documentId,
        version_id: version.id,
        version_number: version.version_number,
      },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true as const, versionNumber: version.version_number };
  });

/**
 * Search documents the caller is allowed to see (RLS + can_read_document).
 * Available to all active staff — not clients.
 */
export const searchGlobalDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { q?: string; caseId?: string; type?: string; folderId?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: role, error: roleErr } = await supabase.rpc("current_role");
    if (roleErr) throw new Error(roleErr.message);
    if (!role || role === "client") {
      throw new Error("Staff accounts only.");
    }

    let query = supabase.from("documents").select(`
      id, case_id, folder_id, title, doc_type, current_version, is_locked, is_archived, approval_status, submitted_at, approved_at, approved_by, uploaded_by, created_at, visibility_mode,
      cases(id, title, case_ref)
    `);

    if (data.q) query = query.ilike("title", `%${data.q}%`);
    if (data.caseId) query = query.eq("case_id", data.caseId);
    if (data.type) query = query.eq("doc_type", data.type);
    if (data.folderId) query = query.eq("folder_id", data.folderId);

    let docs: any[] | null = null;
    {
      const first = await query.order("created_at", { ascending: false }).limit(100);
      if (first.error && /visibility_mode|document_visibility/i.test(first.error.message)) {
        let fallback = supabase.from("documents").select(`
          id, case_id, folder_id, title, doc_type, current_version, is_locked, is_archived, approval_status, submitted_at, approved_at, approved_by, uploaded_by, created_at,
          cases(id, title, case_ref)
        `);
        if (data.q) fallback = fallback.ilike("title", `%${data.q}%`);
        if (data.caseId) fallback = fallback.eq("case_id", data.caseId);
        if (data.type) fallback = fallback.eq("doc_type", data.type);
        if (data.folderId) fallback = fallback.eq("folder_id", data.folderId);
        const second = await fallback.order("created_at", { ascending: false }).limit(100);
        if (second.error) throw new Error(second.error.message);
        docs = second.data ?? [];
      } else if (first.error) {
        throw new Error(first.error.message);
      } else {
        docs = first.data ?? [];
      }
    }
    if (!docs || docs.length === 0) return [];

    const uploaderIds = Array.from(new Set(docs.map((d) => d.uploaded_by).filter((v): v is string => Boolean(v))));
    const nameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", uploaderIds);
      for (const p of profiles ?? []) nameById.set(p.id as string, (p.full_name as string) ?? "");
    }

    return docs.map((d: any) => ({
      id: d.id,
      case_id: d.case_id ?? d.cases?.id ?? null,
      folder_id: d.folder_id,
      title: d.title ?? "Untitled",
      case_title: d.cases?.title ?? "Unknown Matter",
      case_ref: (d.cases?.case_ref as string | null) ?? null,
      doc_type: d.doc_type,
      current_version: d.current_version,
      is_locked: Boolean(d.is_locked),
      is_archived: Boolean(d.is_archived),
      approval_status: (d.approval_status as CaseDocument["approval_status"]) ?? "draft",
      submitted_at: (d.submitted_at as string) ?? null,
      approved_at: (d.approved_at as string) ?? null,
      approved_by: (d.approved_by as string) ?? null,
      uploaded_by: d.uploaded_by,
      uploader_name: d.uploaded_by ? (nameById.get(d.uploaded_by) ?? null) : null,
      created_at: d.created_at as string,
      shared_with_client: false,
      visibility_mode: (d.visibility_mode as DocumentVisibilityMode) ?? "open",
    }));
  });
export const submitForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("submit_document_for_approval", {
      _document_id: data.documentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Return a document to draft status, require revision, and notify the submitter.
 */
export const returnDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string; note: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    if (!input?.note) throw new Error("A return note is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    // Get submitter before we change the state
    const { data: docData } = await supabase
      .from("documents")
      .select("title, case_id, uploaded_by, cases(title)")
      .eq("id", data.documentId)
      .single();
      
    const { error } = await supabase.rpc("return_document", {
      _document_id: data.documentId,
      _note: data.note,
    });
    if (error) throw new Error(error.message);

    // Send email
    if (docData?.uploaded_by) {
      const { supabaseAdmin: adminClient } = await import("@/integrations/supabase/client.server");
      const { data: authUser } = await adminClient.auth.admin.getUserById(docData.uploaded_by);
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", docData.uploaded_by).single();
      if (authUser?.user?.email) {
        supabase.functions.invoke("send-email", {
          body: {
            to: authUser.user.email,
            subject: `Document Returned for Revision: ${docData.title}`,
            html: `<p>Hi ${(prof as any)?.full_name || 'Team Member'},</p><p>Your document <strong>${docData.title}</strong> has been returned for revision with the following note:</p><blockquote>${data.note}</blockquote><p><a href="https://firmcanvas.app/cases/${docData.case_id}">View Document</a></p>`
          }
        }).catch(err => console.error(err));
      }
    }

    return { ok: true };
  });

export const approveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string; note?: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    const { data: docData } = await supabase
      .from("documents")
      .select("title, case_id, uploaded_by")
      .eq("id", data.documentId)
      .single();

    const { error } = await supabase.rpc("approve_document", {
      _document_id: data.documentId,
      _note: data.note || "Approved",
    });
    if (error) throw new Error(error.message);

    if (docData?.uploaded_by) {
      const { supabaseAdmin: adminClient } = await import("@/integrations/supabase/client.server");
      const { data: authUser } = await adminClient.auth.admin.getUserById(docData.uploaded_by);
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", docData.uploaded_by).single();
      if (authUser?.user?.email) {
        supabase.functions.invoke("send-email", {
          body: {
            to: authUser.user.email,
            subject: `Document Approved: ${docData.title}`,
            html: `<p>Hi ${(prof as any)?.full_name || 'Team Member'},</p><p>Great news! Your document <strong>${docData.title}</strong> has been approved.</p><p>It is now in the <strong>Approved Documents</strong> folder and locked as final (view / download only).</p><p><a href="https://firmcanvas.app/cases/${docData.case_id}?tab=documents">View Document</a></p>`
          }
        }).catch(err => console.error(err));
      }
    }

    return { ok: true };
  });

export const createAiDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; title: string; content: string; docType: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.title) throw new Error("A title is required.");
    if (!input?.content) throw new Error("Content is required.");
    if (!input?.docType) throw new Error("Document type is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: folder } = await supabase
      .from("document_folders")
      .select("id")
      .eq("case_id", data.caseId)
      .eq("code", "01")
      .single();

    if (!folder) throw new Error("Internal Drafts folder not found.");

    await assertCanUploadToCase(supabase, data.caseId, folder.id);

    const fileId = crypto.randomUUID();
    const objectName = `${data.caseId}/${folder.id}/${fileId}.txt`;
    const bytes = new TextEncoder().encode(data.content);

    try {
      await uploadToCaseDocuments(objectName, bytes, "text/plain");
    } catch (err) {
      throw new Error(
        `Upload error: ${err instanceof Error ? err.message : "Unknown upload error"}`,
      );
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        case_id: data.caseId,
        folder_id: folder.id,
        title: data.title,
        doc_type: data.docType,
        file_path: objectName,
        current_version: 1,
        approval_status: "draft",
        uploaded_by: userId,
      })
      .select("id")
      .single();

    if (docError || !doc) {
      await removeCaseDocumentObjects([objectName]);
      throw new Error(docError?.message ?? "Failed to create document.");
    }

    const { error: versionError } = await supabase.from("document_versions").insert({
      document_id: doc.id,
      version_number: 1,
      file_path: objectName,
      uploaded_by: userId,
      note: "AI generated draft",
    });
    if (versionError) {
      await supabase.from("documents").delete().eq("id", doc.id);
      await removeCaseDocumentObjects([objectName]);
      throw new Error(versionError.message);
    }

    return { ok: true, id: doc.id as string };
  });

export interface ClientShareStatus {
  shared: boolean;
  canShare: boolean;
  clientName: string | null;
  reason: string | null;
}

async function requireAdminRole(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.role !== "super_admin" && profile?.role !== "admin") {
    throw new Error("Only admins can share documents with clients.");
  }
  return profile.role as "super_admin" | "admin";
}

async function resolveCasePortalClient(
  supabase: SupabaseClient<Database>,
  caseId: string,
): Promise<{ clientId: string; clientName: string; userId: string } | null> {
  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .select("id, client_id")
    .eq("id", caseId)
    .maybeSingle();
  if (caseErr) throw new Error(caseErr.message);
  if (!caseRow?.client_id) return null;

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, full_name, user_id")
    .eq("id", caseRow.client_id)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!client?.user_id) return null;

  return {
    clientId: client.id as string,
    clientName: (client.full_name as string) ?? "Client",
    userId: client.user_id as string,
  };
}

/**
 * Whether the document is shared with the case's portal-linked client.
 */
export const getDocumentClientShareStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    return { documentId: input.documentId };
  })
  .handler(async ({ data, context }): Promise<ClientShareStatus> => {
    const { supabase, userId } = context;
    await requireAdminRole(supabase, userId);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, case_id, title")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc?.case_id) throw new Error("Document not found.");

    const portalClient = await resolveCasePortalClient(supabase, doc.case_id);
    if (!portalClient) {
      return {
        shared: false,
        canShare: false,
        clientName: null,
        reason:
          "This matter has no client with a portal login. Link a client user first.",
      };
    }

    const { data: share, error: shareErr } = await supabase
      .from("document_shares")
      .select("id")
      .eq("document_id", data.documentId)
      .eq("shared_with", portalClient.userId)
      .maybeSingle();
    if (shareErr) throw new Error(shareErr.message);

    return {
      shared: Boolean(share),
      canShare: true,
      clientName: portalClient.clientName,
      reason: null,
    };
  });

/**
 * Share a single document with the case’s portal client (admins only).
 * Visible in the client portal via document_shares RLS.
 */
export const shareDocumentWithClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    return { documentId: input.documentId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; clientName: string }> => {
    const { supabase, userId } = context;
    await requireAdminRole(supabase, userId);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, case_id, title")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc?.case_id) throw new Error("Document not found.");

    const portalClient = await resolveCasePortalClient(supabase, doc.case_id);
    if (!portalClient) {
      throw new Error(
        "This matter has no client with a portal login. Link a client user first.",
      );
    }

    const { error: upsertErr } = await supabase.from("document_shares").upsert(
      {
        document_id: data.documentId,
        shared_with: portalClient.userId,
        shared_by: userId,
        can_download: true,
      },
      { onConflict: "document_id,shared_with" },
    );
    if (upsertErr) throw new Error(upsertErr.message);

    const { error: logErr } = await supabase.from("activity_log").insert({
      case_id: doc.case_id,
      actor_id: userId,
      action: "document_shared_with_client",
      detail: {
        document_id: data.documentId,
        document_title: doc.title,
        client_id: portalClient.clientId,
        client_name: portalClient.clientName,
        shared_with: portalClient.userId,
      },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true, clientName: portalClient.clientName };
  });

/**
 * Remove portal visibility for a document previously shared with the client.
 */
export const unshareDocumentWithClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => {
    if (!input?.documentId) throw new Error("A document id is required.");
    return { documentId: input.documentId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; clientName: string }> => {
    const { supabase, userId } = context;
    await requireAdminRole(supabase, userId);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, case_id, title")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc?.case_id) throw new Error("Document not found.");

    const portalClient = await resolveCasePortalClient(supabase, doc.case_id);
    if (!portalClient) {
      throw new Error("No portal client is linked to this matter.");
    }

    const { error: delErr } = await supabase
      .from("document_shares")
      .delete()
      .eq("document_id", data.documentId)
      .eq("shared_with", portalClient.userId);
    if (delErr) throw new Error(delErr.message);

    const { error: logErr } = await supabase.from("activity_log").insert({
      case_id: doc.case_id,
      actor_id: userId,
      action: "document_unshared_with_client",
      detail: {
        document_id: data.documentId,
        document_title: doc.title,
        client_id: portalClient.clientId,
        client_name: portalClient.clientName,
        shared_with: portalClient.userId,
      },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true, clientName: portalClient.clientName };
  });

const STAFF_VISIBILITY_ROLES: StaffCaseRole[] = [
  "senior_lawyer",
  "junior_lawyer",
  "support",
];

async function loadCaseTeamMembers(
  supabase: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseTeamMember[]> {
  const { data: assignments, error } = await supabase
    .from("case_assignments")
    .select("user_id, is_lead")
    .eq("case_id", caseId);
  if (error) throw new Error(error.message);
  if (!assignments?.length) return [];

  const ids = assignments.map((a) => a.user_id).filter(Boolean) as string[];
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .in("id", ids);
  if (profilesErr) throw new Error(profilesErr.message);

  const leadById = new Map(
    assignments.map((a) => [a.user_id as string, Boolean(a.is_lead)]),
  );

  return (profiles ?? [])
    .filter((p) => p.is_active !== false && p.role !== "client")
    .map((p) => ({
      userId: p.id as string,
      fullName: (p.full_name as string) || "Unnamed",
      role: (p.role as string) || "support",
      isLead: leadById.get(p.id as string) ?? false,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Case team (appointed people) for document visibility pickers.
 */
export const getCaseTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseTeamMember[]> => {
    const { supabase, userId } = context;
    await requireAdminRole(supabase, userId);
    return loadCaseTeamMembers(supabase, data.caseId);
  });

/**
 * Current visibility mode + rules for a document (admin only).
 */
export const getDocumentVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; documentId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.documentId) throw new Error("A document id is required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<DocumentVisibilityState> => {
    const { supabase, userId } = context;
    await requireAdminRole(supabase, userId);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, visibility_mode")
      .eq("id", data.documentId)
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document not found.");

    const { data: rules, error: rulesErr } = await supabase
      .from("document_visibility_rules")
      .select("id, effect, subject_type, user_id, role")
      .eq("document_id", data.documentId);
    if (rulesErr) {
      if (/document_visibility|schema cache|visibility_mode/i.test(rulesErr.message)) {
        throw new Error(
          "Document access migration is not applied yet. Run supabase/migrations/20260723120000_document_visibility_acl.sql in the Supabase SQL editor.",
        );
      }
      throw new Error(rulesErr.message);
    }

    const typedRules = (rules ?? []) as Array<{
      id: string;
      effect: "allow" | "deny";
      subject_type: "user" | "role";
      user_id: string | null;
      role: string | null;
    }>;

    const ruleUserIds = typedRules
      .map((r) => r.user_id)
      .filter((id): id is string => Boolean(id));

    const nameById = new Map<string, string>();
    if (ruleUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ruleUserIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string) ?? "Unnamed");
      }
    }

    const team = await loadCaseTeamMembers(supabase, data.caseId);

    return {
      mode:
        ((doc as { visibility_mode?: string }).visibility_mode as DocumentVisibilityMode) ??
        "open",
      rules: typedRules.map((r) => ({
        id: r.id,
        effect: r.effect,
        subjectType: r.subject_type,
        userId: r.user_id,
        role: r.role,
        userName: r.user_id ? (nameById.get(r.user_id) ?? null) : null,
      })),
      team,
    };
  });

/**
 * Replace document visibility mode and allow/deny rules (admin only).
 */
export const setDocumentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      caseId: string;
      documentId: string;
      mode: DocumentVisibilityMode;
      rules: Array<{
        effect: "allow" | "deny";
        subjectType: "user" | "role";
        userId?: string | null;
        role?: string | null;
      }>;
    }) => {
      if (!input?.caseId) throw new Error("A matter id is required.");
      if (!input?.documentId) throw new Error("A document id is required.");
      if (!["open", "allowlist", "admin_only"].includes(input.mode)) {
        throw new Error("Invalid visibility mode.");
      }
      return {
        caseId: input.caseId,
        documentId: input.documentId,
        mode: input.mode as DocumentVisibilityMode,
        rules: Array.isArray(input.rules) ? input.rules : [],
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await requireAdminRole(supabase, userId);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, title, case_id")
      .eq("id", data.documentId)
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document not found.");

    const normalized = data.rules
      .map((r) => {
        if (r.subjectType === "user") {
          if (!r.userId) return null;
          return {
            document_id: data.documentId,
            effect: r.effect,
            subject_type: "user" as const,
            user_id: r.userId,
            role: null,
            created_by: userId,
          };
        }
        if (!r.role || !STAFF_VISIBILITY_ROLES.includes(r.role as StaffCaseRole)) {
          return null;
        }
        return {
          document_id: data.documentId,
          effect: r.effect,
          subject_type: "role" as const,
          user_id: null,
          role: r.role as StaffCaseRole,
          created_by: userId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const filtered =
      data.mode === "admin_only"
        ? []
        : data.mode === "allowlist"
          ? normalized.filter((r) => r.effect === "allow")
          : normalized.filter((r) => r.effect === "deny");

    const { error: updateErr } = await supabase
      .from("documents")
      .update({ visibility_mode: data.mode })
      .eq("id", data.documentId)
      .eq("case_id", data.caseId);
    if (updateErr) {
      if (/visibility_mode|document_visibility/i.test(updateErr.message)) {
        throw new Error(
          "Document access migration is not applied yet. Run supabase/migrations/20260723120000_document_visibility_acl.sql in the Supabase SQL editor.",
        );
      }
      throw new Error(updateErr.message);
    }

    const { error: delErr } = await supabase
      .from("document_visibility_rules")
      .delete()
      .eq("document_id", data.documentId);
    if (delErr) {
      if (/document_visibility|schema cache/i.test(delErr.message)) {
        throw new Error(
          "Document access migration is not applied yet. Run supabase/migrations/20260723120000_document_visibility_acl.sql in the Supabase SQL editor.",
        );
      }
      throw new Error(delErr.message);
    }

    if (filtered.length > 0) {
      const { error: insErr } = await supabase
        .from("document_visibility_rules")
        .insert(filtered);
      if (insErr) throw new Error(insErr.message);
    }

    const { error: logErr } = await supabase.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: "document_visibility_updated",
      detail: {
        document_id: data.documentId,
        document_title: doc.title,
        mode: data.mode,
        rule_count: filtered.length,
      },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true };
  });
