import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CaseDetail {
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
  opened_at: string | null;
  closed_at: string | null;
  retention_until: string | null;
  next_deadline: string | null;
}

/**
 * Fetch a single case with derived summary fields for the detail page.
 * RLS on `cases` and child tables scopes visibility per role.
 */
export const getCaseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A case id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<CaseDetail> => {
    const { supabase } = context;

    const { data: c, error } = await supabase
      .from("cases")
      .select(
        "id, case_ref, title, client_id, case_type, status, health, current_stage_id, opened_at, closed_at, retention_until",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Case not found.");

    let client_name: string | null = null;
    if (c.client_id) {
      const { data: cl } = await supabase
        .from("clients")
        .select("full_name")
        .eq("id", c.client_id)
        .maybeSingle();
      client_name = (cl?.full_name as string) ?? null;
    }

    let current_stage_name: string | null = null;
    if (c.current_stage_id) {
      const { data: st } = await supabase
        .from("case_stages")
        .select("name")
        .eq("id", c.current_stage_id)
        .maybeSingle();
      current_stage_name = (st?.name as string) ?? null;
    }

    let lead_name: string | null = null;
    const { data: lead } = await supabase
      .from("case_assignments")
      .select("user_id")
      .eq("case_id", c.id)
      .eq("is_lead", true)
      .limit(1)
      .maybeSingle();
    if (lead?.user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", lead.user_id)
        .maybeSingle();
      lead_name = (p?.full_name as string) ?? null;
    }

    let next_deadline: string | null = null;
    const { data: stages } = await supabase
      .from("case_stages")
      .select("deadline, status")
      .eq("case_id", c.id)
      .not("deadline", "is", null);
    for (const s of stages ?? []) {
      if (!s.deadline || s.status === "complete") continue;
      if (!next_deadline || new Date(s.deadline) < new Date(next_deadline)) {
        next_deadline = s.deadline as string;
      }
    }

    return {
      id: c.id,
      case_ref: c.case_ref,
      title: c.title,
      client_id: c.client_id,
      client_name,
      case_type: c.case_type,
      status: c.status,
      health: c.health,
      current_stage_name,
      lead_name,
      opened_at: c.opened_at,
      closed_at: c.closed_at,
      retention_until: c.retention_until,
      next_deadline,
    };
  });

export const CASE_TYPES = [
  "property",
  "litigation",
  "corporate",
  "criminal_defence",
  "other",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

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
      if (!s.case_id || !s.deadline || s.status === "complete") continue;
      const prev = nextDeadline.get(s.case_id);
      if (!prev || new Date(s.deadline) < new Date(prev)) {
        nextDeadline.set(s.case_id, s.deadline);
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

export interface ClientOption {
  id: string;
  client_ref: string | null;
  full_name: string;
}

/** Lightweight client list for the new-case searchable select (RLS-filtered). */
export const listClientOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientOption[]> => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, client_ref, full_name")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({
      id: c.id,
      client_ref: c.client_ref as string | null,
      full_name: c.full_name as string,
    }));
  });

export interface WorkflowTemplateOption {
  id: string;
  name: string;
  case_type: string | null;
}

/** Active workflow templates for the optional template select. */
export const listWorkflowTemplateOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkflowTemplateOption[]> => {
    const { data, error } = await context.supabase
      .from("workflow_templates")
      .select("id, name, case_type, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => ({
      id: t.id,
      name: t.name as string,
      case_type: t.case_type as string | null,
    }));
  });

export interface CreateCaseInput {
  title: string;
  client_id: string;
  case_type: CaseType;
  workflow_template_id?: string | null;
}

/**
 * Create a new case. Generates a unique case_ref (CASE-YYYY-NNNN) via the
 * `next_case_ref` DB function. The DB trigger auto-creates the seven standard
 * folders. If a workflow template is chosen, its stages are copied into
 * case_stages and current_stage_id is set to the first stage. Writes to
 * activity_log (also covered by the case-insert trigger).
 */
export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateCaseInput) => {
    const title = (input.title ?? "").trim();
    if (!title) throw new Error("Title is required.");
    if (!input.client_id) throw new Error("A client is required.");
    if (!CASE_TYPES.includes(input.case_type)) {
      throw new Error("A valid case type is required.");
    }
    return {
      title,
      client_id: input.client_id,
      case_type: input.case_type,
      workflow_template_id: input.workflow_template_id || null,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string; case_ref: string }> => {
    const { supabase, userId } = context;

    const { data: refData, error: refError } = await supabase.rpc("next_case_ref");
    if (refError) throw new Error(refError.message);
    const case_ref = refData as string;

    const { data: inserted, error: insertError } = await supabase
      .from("cases")
      .insert({
        case_ref,
        title: data.title,
        client_id: data.client_id,
        case_type: data.case_type,
        status: "intake",
        health: "on_track",
        created_by: userId,
      })
      .select("id, case_ref")
      .single();
    if (insertError) throw new Error(insertError.message);

    const caseId = inserted.id;
    let firstStageId: string | null = null;

    if (data.workflow_template_id) {
      const { data: tplStages, error: tplError } = await supabase
        .from("workflow_template_stages")
        .select("name, sequence_order, responsible_role, deadline_days")
        .eq("template_id", data.workflow_template_id)
        .order("sequence_order", { ascending: true });
      if (tplError) throw new Error(tplError.message);

      if (tplStages && tplStages.length > 0) {
        const today = new Date();
        const rows = tplStages.map((s) => {
          let deadline: string | null = null;
          if (typeof s.deadline_days === "number") {
            const d = new Date(today);
            d.setDate(d.getDate() + s.deadline_days);
            deadline = d.toISOString().slice(0, 10);
          }
          return {
            case_id: caseId,
            name: s.name as string,
            sequence_order: s.sequence_order as number,
            status: "pending" as const,
            deadline,
          };
        });

        const { data: createdStages, error: stageError } = await supabase
          .from("case_stages")
          .insert(rows)
          .select("id, sequence_order");
        if (stageError) throw new Error(stageError.message);

        const sorted = (createdStages ?? []).sort(
          (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0),
        );
        if (sorted.length > 0) {
          firstStageId = sorted[0].id;
          await supabase
            .from("cases")
            .update({ current_stage_id: firstStageId })
            .eq("id", caseId);
        }
      }
    }

    const { error: logError } = await supabase.from("activity_log").insert({
      case_id: caseId,
      actor_id: userId,
      action: "case_created",
      detail: {
        case_id: caseId,
        case_ref: inserted.case_ref ?? case_ref,
        title: data.title,
        client_id: data.client_id,
        case_type: data.case_type,
        workflow_template_id: data.workflow_template_id,
      },
    });
    if (logError) throw new Error(logError.message);

    return { id: caseId, case_ref: inserted.case_ref ?? case_ref };
  });
