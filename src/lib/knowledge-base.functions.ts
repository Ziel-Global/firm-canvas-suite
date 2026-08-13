import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ClosedCaseRecord {
  id: string;
  title: string;
  case_ref: string | null;
  case_type: string | null;
  client_name: string | null;
  closed_at: string | null;
  retention_until: string | null;
  closure_summary: string | null;
  document_count: number;
  note_count: number;
}

export interface KnowledgeBaseSearchParams {
  q?: string;
  caseType?: string;
  clientName?: string;
  outcome?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Search closed cases for the Knowledge Base.
 * RLS scopes which cases the caller may see.
 * Only closed cases with a closure_summary are returned.
 */
export const searchKnowledgeBase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: KnowledgeBaseSearchParams) => input ?? {})
  .handler(async ({ data, context }): Promise<ClosedCaseRecord[]> => {
    const { supabase } = context;

    let query = supabase
      .from("cases")
      .select(`
        id, title, case_ref, case_type, closed_at, retention_until, closure_summary,
        clients(full_name)
      `)
      .eq("status", "closed")
      .not("closure_summary", "is", null)
      .order("closed_at", { ascending: false });

    if (data.q) {
      query = query.or(`title.ilike.%${data.q}%,closure_summary.ilike.%${data.q}%`);
    }
    if (data.caseType) {
      query = query.eq("case_type", data.caseType);
    }
    if (data.fromDate) {
      query = query.gte("closed_at", data.fromDate);
    }
    if (data.toDate) {
      query = query.lte("closed_at", data.toDate);
    }

    const { data: cases, error } = await query.limit(50);
    if (error) throw new Error(error.message);
    if (!cases || cases.length === 0) return [];

    // Fetch document and note counts per case
    const caseIds = cases.map(c => c.id);

    const { data: docCounts } = await supabase
      .from("documents")
      .select("case_id")
      .in("case_id", caseIds);

    const { data: noteCounts } = await supabase
      .from("case_notes")
      .select("case_id")
      .in("case_id", caseIds);

    const docCountMap = new Map<string, number>();
    const noteCountMap = new Map<string, number>();

    for (const d of docCounts ?? []) {
      if (d.case_id) docCountMap.set(d.case_id, (docCountMap.get(d.case_id) ?? 0) + 1);
    }
    for (const n of noteCounts ?? []) {
      if (n.case_id) noteCountMap.set(n.case_id, (noteCountMap.get(n.case_id) ?? 0) + 1);
    }

    // Filter by client name (post-query since it's on a related table)
    let filtered = cases as any[];
    if (data.clientName) {
      const lower = data.clientName.toLowerCase();
      filtered = filtered.filter(c =>
        (c.clients?.full_name ?? "").toLowerCase().includes(lower)
      );
    }

    return filtered.map(c => ({
      id: c.id,
      title: c.title,
      case_ref: c.case_ref,
      case_type: c.case_type,
      client_name: c.clients?.full_name ?? null,
      closed_at: c.closed_at,
      retention_until: c.retention_until,
      closure_summary: c.closure_summary,
      document_count: docCountMap.get(c.id) ?? 0,
      note_count: noteCountMap.get(c.id) ?? 0,
    }));
  });

/**
 * Auto-generate a structured closure summary from real case data.
 * Called when closing a case to populate the closure_summary field.
 */
export const generateClosureSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("Matter ID required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const { supabase } = context;
    const { caseId } = data;

    // Fetch everything the AI needs — RLS scopes what comes back
    const [caseRes, stagesRes, tasksRes, notesRes, activityRes, docsRes] = await Promise.all([
      supabase
        .from("cases")
        .select("title, case_type, opened_at, clients(full_name)")
        .eq("id", caseId)
        .maybeSingle(),
      supabase
        .from("case_stages")
        .select("name, status, completed_at, started_at")
        .eq("case_id", caseId)
        .order("sequence_order"),
      supabase
        .from("tasks")
        .select("title, status")
        .eq("case_id", caseId),
      supabase
        .from("case_notes")
        .select("body")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("activity_log")
        .select("action, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("documents")
        .select("title, doc_type, approval_status")
        .eq("case_id", caseId),
    ]);

    const caseData = caseRes.data;
    const stages = stagesRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const notes = notesRes.data ?? [];
    const activities = activityRes.data ?? [];
    const docs = docsRes.data ?? [];

    const clientName = (caseData?.clients as any)?.full_name ?? "Unknown Client";
    const completedStages = stages.filter(s => s.status === "complete");
    const openTasks = tasks.filter(t => t.status !== "done");
    const approvedDocs = docs.filter(d => d.approval_status === "approved");

    const milestones = completedStages.map(s =>
      `${s.name}${s.completed_at ? ` (completed ${new Date(s.completed_at).toLocaleDateString()})` : ""}`
    );

    const keyActivities = activities
      .filter(a => a.action)
      .slice(0, 5)
      .map(a => `${new Date(a.created_at).toLocaleDateString()}: ${(a.action as string).replace(/_/g, " ")}`);

    const noteSnippets = notes.slice(0, 3).map(n =>
      n.body.length > 80 ? `${n.body.substring(0, 80)}…` : n.body
    );

    // Build a structured text summary from real data
    const lines: string[] = [
      `CASE: ${caseData?.title ?? "Unknown"} | CLIENT: ${clientName}`,
      `TYPE: ${caseData?.case_type ?? "General"} | OPENED: ${caseData?.opened_at ? new Date(caseData.opened_at).toLocaleDateString() : "Unknown"}`,
      "",
      `STAGES COMPLETED (${completedStages.length}/${stages.length}):`,
      ...(milestones.length > 0 ? milestones.map(m => `  • ${m}`) : ["  • No stages completed"]),
      "",
      `DOCUMENTS (${docs.length} total, ${approvedDocs.length} approved):`,
      ...(approvedDocs.slice(0, 5).map(d => `  • ${d.title ?? "Untitled"} [${d.doc_type ?? "doc"}]`)),
      "",
      `KEY ACTIVITIES:`,
      ...(keyActivities.length > 0 ? keyActivities.map(a => `  • ${a}`) : ["  • No recorded activities"]),
      "",
      `STRATEGY NOTES:`,
      ...(noteSnippets.length > 0 ? noteSnippets.map(n => `  • ${n}`) : ["  • No notes recorded"]),
      "",
      `OPEN TASKS AT CLOSURE: ${openTasks.length}`,
    ];

    return { summary: lines.join("\n") };
  });
