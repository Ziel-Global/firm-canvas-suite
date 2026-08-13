import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CaseSummaryReport {
  client_name: string;
  case_title: string;
  case_type: string;
  current_stage: string;
  responsible_member: string;
  key_dates: string[];
  key_decisions: string[];
  upcoming_deadlines: string[];
  open_tasks: number;
  document_count: number;
}

export const summariseCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("Matter ID required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<CaseSummaryReport> => {
    const { supabase } = context;
    const { caseId } = data;

    // ── Case core (RLS restricts access per role) ──────────────────────
    const { data: caseData, error: caseErr } = await supabase
      .from("cases")
      .select("title, case_type, clients(full_name)")
      .eq("id", caseId)
      .maybeSingle();

    if (caseErr) throw new Error(caseErr.message);
    if (!caseData) throw new Error("Matter not found or access denied.");

    // ── Current stage ──────────────────────────────────────────────────
    const { data: stages } = await supabase
      .from("case_stages")
      .select("name, status, assignee_id, profiles(full_name)")
      .eq("case_id", caseId)
      .in("status", ["active"])
      .order("sequence_order", { ascending: true })
      .limit(1);

    const currentStage = stages?.[0];

    // ── Open tasks (todo / in_progress) ───────────────────────────────
    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, due_date, status")
      .eq("case_id", caseId)
      .in("status", ["todo", "in_progress"])
      .order("due_date", { ascending: true });

    // ── Notes (used for decisions / strategy) ─────────────────────────
    const { data: notes } = await supabase
      .from("case_notes")
      .select("body")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(5);

    // ── Document count ────────────────────────────────────────────────
    const { count: docCount } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("case_id", caseId);

    // ── Activity milestones ───────────────────────────────────────────
    const { data: activities } = await supabase
      .from("activity_log")
      .select("action, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(5);

    // ── Build structured output from REAL data ─────────────────────────
    const keyDates = (activities ?? [])
      .filter(a => a.action)
      .map(a => `${new Date(a.created_at).toLocaleDateString()}: ${(a.action as string).replace(/_/g, " ")}`);

    const deadlines = (tasks ?? [])
      .filter(t => t.due_date)
      .slice(0, 4)
      .map(t => `${new Date(t.due_date!).toLocaleDateString()}: ${t.title}`);

    const decisions = (notes ?? [])
      .map(n => n.body.length > 120 ? `${n.body.substring(0, 120)}…` : n.body);

    // Responsible member: stage assignee or case lead (first assignment)
    const responsibleMember = (currentStage?.profiles as any)?.full_name
      ?? "No assignee on current stage";

    return {
      client_name: (caseData.clients as any)?.full_name ?? "Unknown Client",
      case_title: caseData.title,
      case_type: caseData.case_type ?? "General",
      current_stage: currentStage?.name ?? "No active stage",
      responsible_member: responsibleMember,
      key_dates: keyDates.length > 0 ? keyDates : ["No recent milestones recorded."],
      key_decisions: decisions.length > 0 ? decisions : ["No strategy notes found."],
      upcoming_deadlines: deadlines.length > 0 ? deadlines : ["No upcoming task deadlines."],
      open_tasks: tasks?.length ?? 0,
      document_count: docCount ?? 0,
    };
  });

/**
 * Cleanup dictated text using the AI layer.
 * Fixes punctuation, removes filler words, and structures paragraphs.
 */
export const cleanupDictation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { text: string }) => {
    if (!input?.text) throw new Error("Text is required for cleanup.");
    return input;
  })
  .handler(async ({ data }): Promise<{ cleaned: string }> => {
    // Stub: In a real implementation this would call ai-run edge function
    // with kind: "cleanup_dictation" and pass data.text.
    // For now we simulate a cleaned version.
    
    // Basic mock cleanup to prove the UI flow works.
    let cleaned = data.text
      .replace(/\b(um|uh|like|you know|sort of|kind of)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    
    // Capitalise first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    
    // Add period if missing
    if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
      cleaned += ".";
    }

    return { cleaned };
  });
