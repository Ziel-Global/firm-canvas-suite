import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PendingApprovalRow {
  id: string;
  document_id: string;
  document_title: string;
  case_id: string;
  case_title: string;
  submitted_by: string;
  submitter_name: string | null;
  status: string;
  ai_report: any | null;
  submitted_at: string;
}

/**
 * Fetch pending approvals (Super Admin only).
 * Sorted oldest first (submitted_at ascending).
 */
export const getPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingApprovalRow[]> => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    
    if (role !== "super_admin" && role !== "admin" && role !== "senior_lawyer") {
      throw new Error("Only Super Admins or delegated roles can view the review queue.");
    }

    const { data, error } = await supabase
      .from("approvals")
      .select(`
        id, document_id, case_id, submitted_by, status, ai_report, submitted_at,
        documents(title, doc_type),
        cases(title)
      `)
      .eq("status", "pending")
      .order("submitted_at", { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return [];

    let filteredData = data;
    if (role !== "super_admin") {
      const { data: delegations } = await supabase.from("document_approval_delegations").select("doc_type, allowed_roles");
      const delegationMap = new Map<string, string[]>();
      for (const d of delegations ?? []) {
        delegationMap.set(d.doc_type, d.allowed_roles ?? []);
      }
      filteredData = data.filter(r => {
        const docType = r.documents?.doc_type;
        if (!docType) return false;
        const allowed = delegationMap.get(docType) || [];
        return allowed.includes(role as string);
      });
    }

    if (filteredData.length === 0) return [];

    const submitterIds = Array.from(new Set(filteredData.map((r) => r.submitted_by).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (submitterIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", submitterIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string) ?? "");
      }
    }

    return filteredData.map((r: any) => ({
      id: r.id,
      document_id: r.document_id,
      document_title: r.documents?.title ?? "Unknown Document",
      case_id: r.case_id,
      case_title: r.cases?.title ?? "Unknown Matter",
      submitted_by: r.submitted_by,
      submitter_name: r.submitted_by ? (nameById.get(r.submitted_by) ?? null) : null,
      status: r.status,
      ai_report: r.ai_report,
      submitted_at: r.submitted_at as string,
    }));
  });

export interface ApprovalDetail {
  id: string;
  document_id: string;
  document_title: string;
  case_id: string;
  case_title: string;
  submitted_by: string;
  submitter_name: string | null;
  status: string;
  ai_report: any | null;
  submitted_at: string;
  // Mock content for the two-panel view
  clean_content: string;
  annotated_content: string;
  ai_job_report: any | null;
}

export const getApprovalDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { approvalId: string }) => {
    if (!input?.approvalId) throw new Error("An approval id is required.");
    return { approvalId: input.approvalId };
  })
  .handler(async ({ data, context }): Promise<ApprovalDetail> => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    
    if (role !== "super_admin" && role !== "admin" && role !== "senior_lawyer") {
      throw new Error("Only Super Admins or delegated roles can view approval details.");
    }

    const { data: row, error } = await supabase
      .from("approvals")
      .select(`
        id, document_id, case_id, submitted_by, status, ai_report, submitted_at,
        documents(title, doc_type),
        cases(title)
      `)
      .eq("id", data.approvalId)
      .single();

    if (error) throw new Error(error.message);
    if (!row) throw new Error("Approval not found.");

    if (role !== "super_admin") {
      const { data: delegations } = await supabase
        .from("document_approval_delegations")
        .select("doc_type, allowed_roles");
      const delegationMap = new Map<string, string[]>();
      for (const d of (delegations ?? []) as any[]) {
        if (d.doc_type) delegationMap.set(d.doc_type, d.allowed_roles ?? []);
      }
      const docType = (row.documents as any)?.doc_type;
      const allowed = docType ? (delegationMap.get(docType) || []) : [];
      if (!allowed.includes(role as string)) {
        throw new Error("You do not have delegation authority for this document type.");
      }
    }

    let submitter_name = null;
    if (row.submitted_by) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", row.submitted_by)
        .single();
      if (profile) submitter_name = profile.full_name;
    }

    // Mock an AI Job Report for Part G
    const ai_job_report = {
      summary: "The document appears to be well-structured. Found 2 potential issues that require human review.",
      flags: [
        { type: "risk", description: "Missing liability clause on page 2." },
        { type: "grammar", description: "Inconsistent capitalization in section 4." }
      ]
    };

    return {
      id: row.id,
      document_id: row.document_id ?? "",
      document_title: (row.documents as any)?.title ?? "Unknown Document",
      case_id: row.case_id ?? "",
      case_title: (row.cases as any)?.title ?? "Unknown Matter",
      submitted_by: row.submitted_by ?? "",
      submitter_name,
      status: row.status ?? "pending",
      ai_report: row.ai_report,
      submitted_at: row.submitted_at as string,
      clean_content: "This is the original document content. It contains standard clauses but might be missing some specifics.",
      annotated_content: "This is the original document content. It contains <mark class='bg-yellow-200/50 text-yellow-900 px-1 rounded cursor-help' title='Missing liability clause context'>standard clauses</mark> but might be missing some specifics.",
      ai_job_report,
    };
  });

export interface ApprovalComment {
  id: string;
  approval_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  anchor: any;
  created_at: string;
}

export const getApprovalComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { approvalId: string }) => {
    if (!input?.approvalId) throw new Error("Approval ID required.");
    return { approvalId: input.approvalId };
  })
  .handler(async ({ data, context }): Promise<ApprovalComment[]> => {
    const { supabase } = context;
    const { data: comments, error } = await supabase
      .from("approval_comments")
      .select("id, approval_id, author_id, body, anchor, created_at")
      .eq("approval_id", data.approvalId)
      .order("created_at", { ascending: true });
      
    if (error) throw new Error(error.message);
    if (!comments || comments.length === 0) return [];

    const authorIds = Array.from(new Set(comments.map((c) => c.author_id).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string) ?? "");
      }
    }

    return comments.map((c: any) => ({
      id: c.id,
      approval_id: c.approval_id,
      author_id: c.author_id,
      author_name: c.author_id ? (nameById.get(c.author_id) ?? null) : null,
      body: c.body,
      anchor: c.anchor,
      created_at: c.created_at as string,
    }));
  });

export const createApprovalComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { approvalId: string; body: string; anchor: any }) => {
    if (!input?.approvalId) throw new Error("Approval ID required.");
    if (!input?.body) throw new Error("Comment body required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("approval_comments")
      .insert({
        approval_id: data.approvalId,
        author_id: userId,
        body: data.body,
        anchor: data.anchor,
      });
      
    if (error) throw new Error(error.message);
    return { ok: true };
  });
