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

export interface CaseOverviewActivity {
  id: string;
  action: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface CaseOverview {
  current_stage_name: string | null;
  current_stage_status: string | null;
  current_stage_assignee: string | null;
  next_deadline: string | null;
  next_deadline_stage: string | null;
  health: string | null;
  status: string | null;
  total_stages: number;
  completed_stages: number;
  open_tasks: number;
  overdue_stages: number;
  activity: CaseOverviewActivity[];
}

/**
 * Live overview metrics for a case: current stage + responsible person,
 * next deadline, a health snapshot, and recent activity_log entries.
 * RLS scopes all child reads to what the caller may see.
 */
export const getCaseOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A case id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<CaseOverview> => {
    const { supabase } = context;

    const { data: c, error } = await supabase
      .from("cases")
      .select("id, status, health, current_stage_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Case not found.");

    const { data: stages } = await supabase
      .from("case_stages")
      .select("id, name, status, assignee_id, deadline, sequence_order")
      .eq("case_id", c.id)
      .order("sequence_order", { ascending: true });

    const stageList = stages ?? [];
    const total_stages = stageList.length;
    const completed_stages = stageList.filter((s) => s.status === "complete").length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let current_stage_name: string | null = null;
    let current_stage_status: string | null = null;
    let current_stage_assignee_id: string | null = null;

    const current = c.current_stage_id
      ? stageList.find((s) => s.id === c.current_stage_id)
      : stageList.find((s) => s.status !== "complete");
    if (current) {
      current_stage_name = (current.name as string) ?? null;
      current_stage_status = (current.status as string) ?? null;
      current_stage_assignee_id = (current.assignee_id as string) ?? null;
    }

    let next_deadline: string | null = null;
    let next_deadline_stage: string | null = null;
    let overdue_stages = 0;
    for (const s of stageList) {
      if (!s.deadline || s.status === "complete") continue;
      if (new Date(s.deadline) < today) overdue_stages += 1;
      if (!next_deadline || new Date(s.deadline) < new Date(next_deadline)) {
        next_deadline = s.deadline as string;
        next_deadline_stage = (s.name as string) ?? null;
      }
    }

    // Responsible person for the current stage
    const profileName = new Map<string, string>();
    const profileIds = new Set<string>();
    if (current_stage_assignee_id) profileIds.add(current_stage_assignee_id);

    // Open task count
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, status")
      .eq("case_id", c.id);
    const open_tasks = (tasks ?? []).filter(
      (t) => t.status !== "done",
    ).length;

    // Recent activity
    const { data: acts } = await supabase
      .from("activity_log")
      .select("id, action, actor_id, created_at")
      .eq("case_id", c.id)
      .order("created_at", { ascending: false })
      .limit(6);
    for (const a of acts ?? []) {
      if (a.actor_id) profileIds.add(a.actor_id as string);
    }

    if (profileIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(profileIds));
      for (const p of profiles ?? []) profileName.set(p.id, p.full_name as string);
    }

    const activity: CaseOverviewActivity[] = (acts ?? []).map((a) => ({
      id: a.id as string,
      action: (a.action as string) ?? null,
      actor_name: a.actor_id ? profileName.get(a.actor_id as string) ?? null : null,
      created_at: a.created_at as string,
    }));

    return {
      current_stage_name,
      current_stage_status,
      current_stage_assignee: current_stage_assignee_id
        ? profileName.get(current_stage_assignee_id) ?? null
        : null,
      next_deadline,
      next_deadline_stage,
      health: c.health,
      status: c.status,
      total_stages,
      completed_stages,
      open_tasks,
      overdue_stages,
      activity,
    };
  });

export interface CaseNote {
  id: string;
  body: string;
  is_principal_only: boolean;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
}

/**
 * List notes for a case, newest first. RLS hides principal-only notes from
 * everyone except super_admin.
 */
export const getCaseNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseNote[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("case_notes")
      .select("id, body, is_principal_only, created_at, author_id")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const authorIds = Array.from(
      new Set((rows ?? []).map((r) => r.author_id).filter(Boolean) as string[]),
    );
    const names = new Map<string, string>();
    if (authorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      for (const p of profiles ?? []) names.set(p.id, p.full_name as string);
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      body: r.body,
      is_principal_only: r.is_principal_only,
      created_at: r.created_at,
      author_id: r.author_id,
      author_name: r.author_id ? names.get(r.author_id) ?? null : null,
    }));
  });

/**
 * Add a note to a case. RLS enforces that the caller has full case access and
 * that only super_admin may flag a note principal-only.
 */
export const addCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    caseId: string;
    body: string;
    isPrincipalOnly?: boolean;
  }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    const body = (input.body ?? "").trim();
    if (!body) throw new Error("Note text is required.");
    return {
      caseId: input.caseId,
      body,
      isPrincipalOnly: Boolean(input.isPrincipalOnly),
    };
  })
  .handler(async ({ data, context }): Promise<CaseNote> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("case_notes")
      .insert({
        case_id: data.caseId,
        author_id: userId,
        body: data.body,
        is_principal_only: data.isPrincipalOnly,
      })
      .select("id, body, is_principal_only, created_at, author_id")
      .single();
    if (error) throw new Error(error.message);

    let author_name: string | null = null;
    const { data: me } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    author_name = (me?.full_name as string) ?? null;

    return {
      id: row.id,
      body: row.body,
      is_principal_only: row.is_principal_only,
      created_at: row.created_at,
      author_id: row.author_id,
      author_name,
    };
  });

export interface CaseActivityEntry {
  id: string;
  action: string | null;
  detail: Record<string, string | number | boolean | null> | null;
  actor_name: string | null;
  created_at: string;
}

/**
 * Full activity_log timeline for a case. RLS on activity_log scopes rows to
 * the cases the caller is allowed to read, so each role only sees permitted
 * entries.
 */
export const getCaseActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseActivityEntry[]> => {
    const { supabase } = context;

    const { data: acts, error } = await supabase
      .from("activity_log")
      .select("id, action, detail, actor_id, created_at")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = new Set<string>();
    for (const a of acts ?? []) {
      if (a.actor_id) ids.add(a.actor_id as string);
    }

    const names = new Map<string, string>();
    if (ids.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(ids));
      for (const p of profiles ?? []) names.set(p.id, p.full_name as string);
    }

    return (acts ?? []).map((a) => ({
      id: a.id as string,
      action: (a.action as string) ?? null,
      detail: (a.detail as Record<string, string | number | boolean | null> | null) ?? null,
      actor_name: a.actor_id ? names.get(a.actor_id as string) ?? null : null,
      created_at: a.created_at as string,
    }));
  });
