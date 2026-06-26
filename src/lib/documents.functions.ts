import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "case-documents";

/**
 * Allowed upload types. Maps a normalised file extension to its MIME type.
 * Anything outside this list (notably executables) is rejected.
 */
const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
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
  doc_type: string | null;
  current_version: number | null;
  is_locked: boolean;
  is_archived: boolean;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
}

/**
 * List the document folders for a case that the caller may access.
 * RLS on `document_folders` scopes which folders each role can see.
 */
export const getCaseFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caseId: string }) => {
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
  .inputValidator((input: { caseId: string; folderId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.folderId) throw new Error("A folder id is required.");
    return { caseId: input.caseId, folderId: input.folderId };
  })
  .handler(async ({ data, context }): Promise<CaseDocument[]> => {
    const { supabase } = context;

    const { data: docs, error } = await supabase
      .from("documents")
      .select(
        "id, folder_id, title, doc_type, current_version, is_locked, is_archived, uploaded_by, created_at",
      )
      .eq("case_id", data.caseId)
      .eq("folder_id", data.folderId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) return [];

    const uploaderIds = Array.from(
      new Set(
        docs.map((d) => d.uploaded_by).filter((v): v is string => Boolean(v)),
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

    return docs.map((d) => ({
      id: d.id,
      folder_id: d.folder_id,
      title: d.title ?? "Untitled",
      doc_type: d.doc_type,
      current_version: d.current_version,
      is_locked: Boolean(d.is_locked),
      is_archived: Boolean(d.is_archived),
      uploaded_by: d.uploaded_by,
      uploader_name: d.uploaded_by ? nameById.get(d.uploaded_by) ?? null : null,
      created_at: d.created_at as string,
    }));
  });
