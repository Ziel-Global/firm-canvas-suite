import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "case-documents";

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

export interface CaseDocument {
  id: string;
  folder_id: string | null;
  title: string;
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
}

// --- MALWARE SCANNING HOOK ---
// TODO: Connect to a real scanning service (e.g. AWS Macie, ClamAV, or VirusTotal API)
async function mockMalwareScan(bytes: Uint8Array, fileName: string): Promise<boolean> {
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
    if (!input?.caseId) throw new Error("A case id is required.");
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
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.folderId) throw new Error("A folder id is required.");
    return { caseId: input.caseId, folderId: input.folderId };
  })
  .handler(async ({ data, context }): Promise<CaseDocument[]> => {
    const { supabase } = context;

    const { data: docs, error } = await supabase
      .from("documents")
      .select(
        "id, folder_id, title, doc_type, current_version, is_locked, is_archived, approval_status, submitted_at, approved_at, approved_by, uploaded_by, created_at",
      )
      .eq("case_id", data.caseId)
      .eq("folder_id", data.folderId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) return [];

    const uploaderIds = Array.from(
      new Set(docs.map((d) => d.uploaded_by).filter((v): v is string => Boolean(v))),
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

    return docs.map((d) => ({
      id: d.id,
      folder_id: d.folder_id,
      title: d.title ?? "Untitled",
      doc_type: d.doc_type,
      current_version: d.current_version,
      is_locked: Boolean(d.is_locked),
      is_archived: Boolean(d.is_archived),
      approval_status: (d.approval_status as CaseDocument['approval_status']) ?? 'draft',
      submitted_at: (d.submitted_at as string) ?? null,
      approved_at: (d.approved_at as string) ?? null,
      approved_by: (d.approved_by as string) ?? null,
      uploaded_by: d.uploaded_by,
      uploader_name: d.uploaded_by ? (nameById.get(d.uploaded_by) ?? null) : null,
      created_at: d.created_at as string,
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
    if (!input?.caseId) throw new Error("A case id is required.");
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
    if (typeof caseId !== "string" || !caseId) throw new Error("A case id is required.");
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

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, bytes, {
      contentType: allowedMimes[0],
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

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
        await supabase.storage.from(BUCKET).remove([objectName]);
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
        await supabase.storage.from(BUCKET).remove([objectName]);
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
      await supabase.storage.from(BUCKET).remove([objectName]);
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
      await supabase.storage.from(BUCKET).remove([objectName]);
      throw new Error(updateError.message);
    }

    return { id: existingDocument!.id as string };
  });

/**
 * Restore a prior document version.
 * Only Super Admins can perform this action.
 */
export const restoreDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; documentId: string; versionId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
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
 * Search all documents across the firm.
 * Super Admins and Admins only.
 * Returns only permitted documents because of RLS on documents and document_folders.
 */
export const searchGlobalDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { q?: string; caseId?: string; type?: string; folderId?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.rpc("current_role");
    
    if (role !== "super_admin" && role !== "admin") {
      throw new Error("Only administrators can search documents.");
    }

    let query = supabase.from("documents").select(`
      id, folder_id, title, doc_type, current_version, is_locked, is_archived, approval_status, submitted_at, approved_at, approved_by, uploaded_by, created_at,
      cases(id, title)
    `);

    if (data.q) query = query.ilike("title", `%${data.q}%`);
    if (data.caseId) query = query.eq("case_id", data.caseId);
    if (data.type) query = query.eq("doc_type", data.type);
    if (data.folderId) query = query.eq("folder_id", data.folderId);
    
    const { data: docs, error } = await query.order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) return [];
    
    const uploaderIds = Array.from(new Set(docs.map((d) => d.uploaded_by).filter((v): v is string => Boolean(v))));
    const nameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", uploaderIds);
      for (const p of profiles ?? []) nameById.set(p.id as string, (p.full_name as string) ?? "");
    }

    return docs.map((d: any) => ({
      id: d.id,
      folder_id: d.folder_id,
      title: d.title ?? "Untitled",
      case_title: d.cases?.title ?? "Unknown Case",
      doc_type: d.doc_type,
      current_version: d.current_version,
      is_locked: Boolean(d.is_locked),
      is_archived: Boolean(d.is_archived),
      approval_status: (d.approval_status as CaseDocument['approval_status']) ?? 'draft',
      submitted_at: (d.submitted_at as string) ?? null,
      approved_at: (d.approved_at as string) ?? null,
      approved_by: (d.approved_by as string) ?? null,
      uploaded_by: d.uploaded_by,
      uploader_name: d.uploaded_by ? (nameById.get(d.uploaded_by) ?? null) : null,
      created_at: d.created_at as string,
    }));
  });

/**
 * Submit a document for approval.
 */
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
            html: `<p>Hi ${(prof as any)?.full_name || 'Team Member'},</p><p>Great news! Your document <strong>${docData.title}</strong> has been approved.</p><p><a href="https://firmcanvas.app/cases/${docData.case_id}">View Document</a></p>`
          }
        }).catch(err => console.error(err));
      }
    }

    return { ok: true };
  });

export const createAiDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; title: string; content: string; docType: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.title) throw new Error("A title is required.");
    if (!input?.content) throw new Error("Content is required.");
    if (!input?.docType) throw new Error("Document type is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Find the "01 Internal Drafts" folder for this case
    const { data: folder } = await supabase
      .from("document_folders")
      .select("id")
      .eq("case_id", data.caseId)
      .eq("code", "01")
      .single();

    if (!folder) throw new Error("Internal Drafts folder not found.");

    // 2. Upload content as a file to Supabase Storage
    // Generating a random filename
    const fileId = crypto.randomUUID();
    const filePath = `${data.caseId}/${fileId}.txt`; // using .txt for now
    
    // In a Node/Deno environment, we can upload a string directly or as a Blob/File
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, data.content, {
        contentType: "text/plain",
      });

    if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

    // 3. Create document record
    const { error: docError } = await supabase.from("documents").insert({
      case_id: data.caseId,
      folder_id: folder.id,
      title: data.title,
      doc_type: data.docType,
      file_path: filePath,
      file_type: "text/plain",
      file_size_bytes: new Blob([data.content]).size,
      approval_status: "draft",
      uploaded_by: userId,
    });

    if (docError) throw new Error(`Database error: ${docError.message}`);

    return { ok: true };
  });
