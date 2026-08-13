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
  lead_id: string | null;
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
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("A matter id is required.");
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
    if (!c) throw new Error("Matter not found.");

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
    let lead_id: string | null = null;
    const { data: lead } = await supabase
      .from("case_assignments")
      .select("user_id")
      .eq("case_id", c.id)
      .eq("is_lead", true)
      .limit(1)
      .maybeSingle();
    if (lead?.user_id) {
      lead_id = lead.user_id as string;
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
      lead_id,
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
  lead_id: string | null;
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
        lead_id: lid ?? null,
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
}

/**
 * Create a new case. Generates a unique case_ref (CASE-YYYY-NNNN) via the
 * `next_case_ref` DB function. The DB trigger auto-creates the seven standard
 * folders. Stages are not auto-created — admins add them (with deadlines) on
 * the case Stages tab. Writes to activity_log (also covered by the case-insert
 * trigger).
 *
 * Authorization is checked against the caller's profile (JWT sub). The write
 * uses the service-role client so RLS WITH CHECK / RETURNING quirks cannot
 * block a verified admin create.
 */
export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateCaseInput) => {
    const title = (input.title ?? "").trim();
    if (!title) throw new Error("Title is required.");
    if (!input.client_id) throw new Error("A client is required.");
    if (!CASE_TYPES.includes(input.case_type)) {
      throw new Error("A valid matter type is required.");
    }
    return {
      title,
      client_id: input.client_id,
      case_type: input.case_type,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string; case_ref: string }> => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.is_active) throw new Error("Your account is inactive.");
    if (profile.role !== "super_admin" && profile.role !== "admin") {
      throw new Error("Only admins can create matters.");
    }

    const { data: refData, error: refError } =
      await supabaseAdmin.rpc("next_case_ref");
    if (refError) throw new Error(refError.message);
    const case_ref = refData as string;

    const { data: inserted, error: insertError } = await supabaseAdmin
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

    const { error: logError } = await supabaseAdmin.from("activity_log").insert({
      case_id: caseId,
      actor_id: userId,
      action: "case_created",
      detail: {
        case_id: caseId,
        case_ref: inserted.case_ref ?? case_ref,
        title: data.title,
        client_id: data.client_id,
        case_type: data.case_type,
      },
    });
    // Trigger already logs case_created; don't fail the create if a second write is blocked.
    if (logError) {
      console.warn("[createCase] activity_log insert skipped:", logError.message);
    }

    return { id: caseId, case_ref: inserted.case_ref ?? case_ref };
  });

export interface UpdateCaseInput {
  id: string;
  title: string;
  client_id: string;
  case_type: CaseType;
}

/**
 * Update core case details (title, client, type). Admins only.
 * Status / lead / lifecycle stay on their dedicated flows.
 */
export const updateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UpdateCaseInput) => {
    const title = (input.title ?? "").trim();
    if (!input?.id) throw new Error("A matter id is required.");
    if (!title) throw new Error("Title is required.");
    if (!input.client_id) throw new Error("A client is required.");
    if (!CASE_TYPES.includes(input.case_type)) {
      throw new Error("A valid matter type is required.");
    }
    return {
      id: input.id,
      title,
      client_id: input.client_id,
      case_type: input.case_type,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.is_active) throw new Error("Your account is inactive.");
    if (profile.role !== "super_admin" && profile.role !== "admin") {
      throw new Error("Only admins can edit matters.");
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("cases")
      .select("id, title, client_id, case_type")
      .eq("id", data.id)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (!existing) throw new Error("Matter not found.");

    const { error: updateError } = await supabaseAdmin
      .from("cases")
      .update({
        title: data.title,
        client_id: data.client_id,
        case_type: data.case_type,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    const { error: logError } = await supabaseAdmin.from("activity_log").insert({
      case_id: data.id,
      actor_id: userId,
      action: "case_updated",
      detail: {
        before: {
          title: existing.title,
          client_id: existing.client_id,
          case_type: existing.case_type,
        },
        after: {
          title: data.title,
          client_id: data.client_id,
          case_type: data.case_type,
        },
      },
    });
    if (logError) {
      console.warn("[updateCase] activity_log insert skipped:", logError.message);
    }

    return { id: data.id };
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
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("A matter id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<CaseOverview> => {
    const { supabase, userId } = context;

    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const canViewActivity =
      caller?.role === "super_admin" || caller?.role === "admin";

    const { data: c, error } = await supabase
      .from("cases")
      .select("id, status, health, current_stage_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Matter not found.");

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

    // Recent activity — admins / super_admins only
    let acts: { id: string; action: string | null; actor_id: string | null; created_at: string }[] =
      [];
    if (canViewActivity) {
      const { data: activityRows } = await supabase
        .from("activity_log")
        .select("id, action, actor_id, created_at")
        .eq("case_id", c.id)
        .order("created_at", { ascending: false })
        .limit(6);
      acts = (activityRows ?? []) as typeof acts;
      for (const a of acts) {
        if (a.actor_id) profileIds.add(a.actor_id);
      }
    }

    if (profileIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(profileIds));
      for (const p of profiles ?? []) profileName.set(p.id, p.full_name as string);
    }

    const activity: CaseOverviewActivity[] = acts.map((a) => ({
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
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
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
  .validator((input: {
    caseId: string;
    body: string;
    isPrincipalOnly?: boolean;
  }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
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
 * Full activity_log timeline for a case. Admins and super_admins only.
 */
export const getCaseActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseActivityEntry[]> => {
    const { supabase, userId } = context;

    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (caller?.role !== "super_admin" && caller?.role !== "admin") {
      throw new Error("Only admins can view matter activity.");
    }

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

export interface CaseAccessRow {
  user_id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
  role_default: string;
  override_level: string | null;
  effective_level: string;
  folder_scope: string | null;
}

/**
 * Compute every team member's effective access to a specific case.
 * Super-admin only. Uses effective_case_access_for(_user_id, _case_id)
 * to derive role default, override, effective level, and folder scope.
 */
export const getCaseAccessMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseAccessRow[]> => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: members, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .neq("role", "client")
      .order("full_name", { ascending: true });
    if (error) throw error;

    const rows: CaseAccessRow[] = [];
    for (const m of members ?? []) {
      const { data: acc } = await supabase.rpc("effective_case_access_for", {
        _user_id: m.id as string,
        _case_id: data.caseId,
      });
      const a = Array.isArray(acc) ? acc[0] : acc;
      rows.push({
        user_id: m.id as string,
        full_name: (m.full_name as string) ?? null,
        role: (m.role as string) ?? null,
        is_active: (m.is_active as boolean) ?? false,
        role_default: (a?.role_default as string) ?? "none",
        override_level: (a?.override_level as string) ?? null,
        effective_level: (a?.effective_level as string) ?? "none",
        folder_scope: (a?.folder_scope as string) ?? null,
      });
    }
    return rows;
  });

export interface CaseStageRow {
  id: string;
  name: string | null;
  sequence_order: number | null;
  status: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  expected_output: string | null;
  notes: string | null;
}

/** Ordered stages for a case, with assignee names and expected output from the template. RLS scopes visibility. */
export const getCaseStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseStageRow[]> => {
    const { supabase } = context;
    const { data: stages, error } = await supabase
      .from("case_stages")
      .select(
        "id, name, sequence_order, status, assignee_id, started_at, completed_at, deadline, notes, template_stage_id",
      )
      .eq("case_id", data.caseId)
      .order("sequence_order", { ascending: true });
    if (error) throw new Error(error.message);
    const list = stages ?? [];

    const assigneeIds = Array.from(
      new Set(list.map((s) => s.assignee_id).filter(Boolean) as string[]),
    );
    const templateStageIds = Array.from(
      new Set(
        list.map((s) => s.template_stage_id).filter(Boolean) as string[],
      ),
    );

    const nameMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      for (const p of profiles ?? [])
        nameMap.set(p.id as string, (p.full_name as string) ?? "");
    }

    const outputMap = new Map<string, string>();
    if (templateStageIds.length > 0) {
      const { data: tStages } = await supabase
        .from("workflow_template_stages")
        .select("id, expected_output")
        .in("id", templateStageIds);
      for (const ts of tStages ?? [])
        outputMap.set(ts.id as string, (ts.expected_output as string) ?? "");
    }

    return list.map((s) => ({
      id: s.id as string,
      name: (s.name as string) ?? null,
      sequence_order: (s.sequence_order as number) ?? null,
      status: (s.status as string) ?? null,
      assignee_id: (s.assignee_id as string) ?? null,
      assignee_name: s.assignee_id
        ? nameMap.get(s.assignee_id as string) ?? null
        : null,
      started_at: (s.started_at as string) ?? null,
      completed_at: (s.completed_at as string) ?? null,
      deadline: (s.deadline as string) ?? null,
      expected_output: s.template_stage_id
        ? outputMap.get(s.template_stage_id as string) ?? null
        : null,
      notes: (s.notes as string) ?? null,
    }));
  });
