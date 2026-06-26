import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CaseRow {
  id: string;
  case_ref: string | null;
  title: string;
  client_id: string | null;
  client_name: string | null;
  case_type: string | null;
  status: string | null;
  health: string | null;
  current_stage_name: string | null;
  lead_name: string | null;
  next_deadline: string | null;
}

/**
 * List cases visible to the caller. RLS on `cases` (and child tables
 * `case_stages`, `case_assignments`) enforces who sees what:
 * - super_admin / admin: all cases
 * - senior / junior lawyer: only assigned cases (junior limited to stage)
 * - support: cases with an assigned task
 * - client: their own case
 * All derived data is computed from RLS-filtered rows.
 */
export const listCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CaseRow[]> => {
    const { supabase } = context;

    const { data: cases, error: casesError } = await supabase
      .from("cases")
      .select(
        "id, case_ref, title, client_id, case_type, status, health, current_stage_id",
      )
      .order("created_at", { ascending: false });
    if (casesError) throw new Error(casesError.message);
    if (!cases || cases.length === 0) return [];

    const caseIds = cases.map((c) => c.id);
    const clientIds = Array.from(
      new Set(cases.map((c) => c.client_id).filter((v): v is string => Boolean(v))),
    );
    const stageIds = Array.from(
      new Set(
        cases
          .map((c) => c.current_stage_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );

    // Client names
    const clientName = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      for (const c of clients ?? []) clientName.set(c.id, c.full_name as string);
    }

    // Current stage names
    const stageName = new Map<string, string>();
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from("case_stages")
        .select("id, name")
        .in("id", stageIds);
      for (const s of stages ?? []) stageName.set(s.id, s.name as string);
    }

    // Lead assignees
    const leadId = new Map<string, string>();
    const { data: assignments } = await supabase
      .from("case_assignments")
      .select("case_id, user_id, is_lead")
      .in("case_id", caseIds)
      .eq("is_lead", true);
    for (const a of assignments ?? []) {
      if (a.case_id && a.user_id && !leadId.has(a.case_id)) {
        leadId.set(a.case_id, a.user_id);
      }
    }

    const leadUserIds = Array.from(new Set(leadId.values()));
    const profileName = new Map<string, string>();
    if (leadUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", leadUserIds);
      for (const p of profiles ?? []) profileName.set(p.id, p.full_name as string);
    }

    // Next deadline from upcoming/active stages per case
    const nextDeadline = new Map<string, string>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: deadlineStages } = await supabase
      .from("case_stages")
      .select("case_id, deadline, status")
      .in("case_id", caseIds)
      .not("deadline", "is", null);
    for (const s of deadlineStages ?? []) {
      if (!s.deadline || s.status === "complete") continue;
      const prev = nextDeadline.get(s.case_id);
      if (!prev || new Date(s.deadline) < new Date(prev)) {
        nextDeadline.set(s.case_id, s.deadline as string);
      }
    }

    return cases.map((c) => {
      const lid = leadId.get(c.id);
      return {
        id: c.id,
        case_ref: c.case_ref,
        title: c.title,
        client_id: c.client_id,
        client_name: c.client_id ? clientName.get(c.client_id) ?? null : null,
        case_type: c.case_type,
        status: c.status,
        health: c.health,
        current_stage_name: c.current_stage_id
          ? stageName.get(c.current_stage_id) ?? null
          : null,
        lead_name: lid ? profileName.get(lid) ?? null : null,
        next_deadline: nextDeadline.get(c.id) ?? null,
      };
    });
  });
