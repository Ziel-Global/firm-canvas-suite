import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CASE_STATUSES = ["intake", "active", "on_hold", "closed"] as const;
type CaseStatus = (typeof CASE_STATUSES)[number];

/** Ensure the caller is an active super_admin or admin; throws otherwise. */
async function assertCaseAdmin(supabaseAdmin: any, userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !profile?.is_active ||
    (profile.role !== "super_admin" && profile.role !== "admin")
  ) {
    throw new Error("Only an admin can perform this action.");
  }
  return profile as { role: string; is_active: boolean };
}

/** Ensure the caller is an active super_admin; throws otherwise. */
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile || profile.role !== "super_admin" || !profile.is_active) {
    throw new Error("Only an active Super Admin can perform this action.");
  }
}

/**
 * Change a case status. The `log_case_activity` trigger records the change in
 * activity_log automatically when the status differs.
 */
export const changeCaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; status: CaseStatus }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!CASE_STATUSES.includes(input.status)) {
      throw new Error("Invalid status.");
    }
    return { caseId: input.caseId, status: input.status };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    const { error } = await supabase
      .from("cases")
      .update({ status: data.status })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * Assign or reassign the case lead. Previous lead stays on the team as a
 * non-lead lawyer by default (`keepOnTeam`), or is removed when false.
 * Admins and super admins may do this. A case may have one lead and many
 * other assigned lawyers.
 */
export const reassignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    caseId: string;
    newLeadId: string;
    keepOnTeam?: boolean;
    /** @deprecated use keepOnTeam */
    keepReadOnly?: boolean;
  }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.newLeadId) throw new Error("A new lead is required.");
    const keepOnTeam =
      input.keepOnTeam !== undefined
        ? input.keepOnTeam !== false
        : input.keepReadOnly !== false;
    return {
      caseId: input.caseId,
      newLeadId: input.newLeadId,
      keepOnTeam,
    };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertCaseAdmin(supabaseAdmin, userId);

    const { data: leadProfile, error: leadProfErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", data.newLeadId)
      .maybeSingle();
    if (leadProfErr) throw new Error(leadProfErr.message);
    if (!leadProfile?.is_active) {
      throw new Error("That user is inactive and cannot be assigned.");
    }
    const allowedLeadRoles = [
      "super_admin",
      "admin",
      "senior_lawyer",
      "junior_lawyer",
    ];
    if (!allowedLeadRoles.includes(leadProfile.role)) {
      throw new Error("Pick a staff member as the case lead.");
    }

    const { data: currentLead, error: leadErr } = await supabaseAdmin
      .from("case_assignments")
      .select("id, user_id")
      .eq("case_id", data.caseId)
      .eq("is_lead", true)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);

    const previousLeadId: string | null = currentLead?.user_id ?? null;

    if (previousLeadId === data.newLeadId) {
      return {
        ok: true,
        unchanged: true,
        lead_name: leadProfile.full_name ?? null,
      };
    }

    if (currentLead?.id && previousLeadId) {
      if (data.keepOnTeam) {
        const { error: demoteErr } = await supabaseAdmin
          .from("case_assignments")
          .update({
            is_lead: false,
            role_on_case: "lawyer",
          })
          .eq("id", currentLead.id);
        if (demoteErr) throw new Error(demoteErr.message);
      } else {
        const { error: delErr } = await supabaseAdmin
          .from("case_assignments")
          .delete()
          .eq("id", currentLead.id);
        if (delErr) throw new Error(delErr.message);
      }
    }

    // Promote existing member, or insert as lead.
    const { data: existingMember } = await supabaseAdmin
      .from("case_assignments")
      .select("id")
      .eq("case_id", data.caseId)
      .eq("user_id", data.newLeadId)
      .maybeSingle();

    if (existingMember?.id) {
      const { error: promoteErr } = await supabaseAdmin
        .from("case_assignments")
        .update({
          is_lead: true,
          role_on_case: "lead",
          assigned_by: userId,
        })
        .eq("id", existingMember.id);
      if (promoteErr) throw new Error(promoteErr.message);
    } else {
      const { error: insErr } = await supabaseAdmin
        .from("case_assignments")
        .insert({
          case_id: data.caseId,
          user_id: data.newLeadId,
          role_on_case: "lead",
          is_lead: true,
          assigned_by: userId,
        });
      if (insErr) throw new Error(insErr.message);
    }

    // Also assign the active stage to the new lead when it has no assignee.
    const { data: activeStage } = await supabaseAdmin
      .from("case_stages")
      .select("id, assignee_id")
      .eq("case_id", data.caseId)
      .eq("status", "active")
      .maybeSingle();
    if (activeStage?.id && !activeStage.assignee_id) {
      await supabaseAdmin
        .from("case_stages")
        .update({ assignee_id: data.newLeadId })
        .eq("id", activeStage.id);
    }

    await supabaseAdmin.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: previousLeadId ? "lead_reassigned" : "lead_assigned",
      detail: {
        previous_lead: previousLeadId,
        new_lead: data.newLeadId,
        lead_name: leadProfile.full_name,
        kept_on_team: data.keepOnTeam,
      },
    });

    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: previousLeadId ? "case_lead_reassigned" : "case_lead_assigned",
      target_table: "case_assignments",
      target_id: data.caseId,
      detail: {
        previous_lead: previousLeadId,
        new_lead: data.newLeadId,
        kept_on_team: data.keepOnTeam,
      },
    });

    return {
      ok: true,
      lead_name: leadProfile.full_name ?? null,
      lead_id: data.newLeadId,
    };
  });

export interface CaseTeamMemberRow {
  userId: string;
  fullName: string;
  role: string;
  isLead: boolean;
  roleOnCase: string | null;
  assignedAt: string | null;
}

/** List everyone assigned to the case (lead + other lawyers). */
export const listCaseTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<CaseTeamMemberRow[]> => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertCaseAdmin(supabaseAdmin, userId);

    const { data: rows, error } = await supabaseAdmin
      .from("case_assignments")
      .select("user_id, is_lead, role_on_case, assigned_at")
      .eq("case_id", data.caseId)
      .order("is_lead", { ascending: false })
      .order("assigned_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];

    const ids = rows.map((r) => r.user_id).filter(Boolean) as string[];
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);

    const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    return rows
      .map((r) => {
        const p = byId.get(r.user_id as string);
        if (!p || p.is_active === false) return null;
        return {
          userId: r.user_id as string,
          fullName: (p.full_name as string) || "Unnamed",
          role: (p.role as string) || "support",
          isLead: Boolean(r.is_lead),
          roleOnCase: (r.role_on_case as string | null) ?? null,
          assignedAt: (r.assigned_at as string | null) ?? null,
        };
      })
      .filter((m): m is CaseTeamMemberRow => m !== null);
  });

/**
 * Add another lawyer (non-lead) to the case team. One lead + many lawyers.
 */
export const addCaseTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; userId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.userId) throw new Error("A user is required.");
    return { caseId: input.caseId, userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertCaseAdmin(supabaseAdmin, actorId);

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", data.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile?.is_active) {
      throw new Error("That user is inactive and cannot be assigned.");
    }
    const allowed = [
      "super_admin",
      "admin",
      "senior_lawyer",
      "junior_lawyer",
    ];
    if (!allowed.includes(profile.role as string)) {
      throw new Error("Only lawyers (or admins) can be added to a case team.");
    }

    const { data: existing } = await supabaseAdmin
      .from("case_assignments")
      .select("id, is_lead")
      .eq("case_id", data.caseId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existing) {
      throw new Error("That person is already on this case team.");
    }

    const { error: insErr } = await supabaseAdmin.from("case_assignments").insert({
      case_id: data.caseId,
      user_id: data.userId,
      role_on_case: "lawyer",
      is_lead: false,
      assigned_by: actorId,
    });
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: actorId,
      action: "team_member_added",
      detail: {
        user_id: data.userId,
        full_name: profile.full_name,
        role: profile.role,
      },
    });

    return { ok: true as const, fullName: profile.full_name ?? null };
  });

/**
 * Remove a non-lead lawyer from the case. Lead must be changed first.
 */
export const removeCaseTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; userId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.userId) throw new Error("A user is required.");
    return { caseId: input.caseId, userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertCaseAdmin(supabaseAdmin, actorId);

    const { data: row, error } = await supabaseAdmin
      .from("case_assignments")
      .select("id, is_lead, user_id")
      .eq("case_id", data.caseId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That person is not on this case team.");
    if (row.is_lead) {
      throw new Error(
        "Assign a different lead before removing the current lead from the team.",
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from("case_assignments")
      .delete()
      .eq("id", row.id);
    if (delErr) throw new Error(delErr.message);

    await supabaseAdmin.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: actorId,
      action: "team_member_removed",
      detail: { user_id: data.userId },
    });

    return { ok: true as const };
  });

/**
 * Assign a lawyer to a specific case stage.
 */
export const assignStageAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { stageId: string; assigneeId: string | null }) => {
    if (!input?.stageId) throw new Error("A stage id is required.");
    return {
      stageId: input.stageId,
      assigneeId: input.assigneeId?.trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertCaseAdmin(supabaseAdmin, userId);

    if (data.assigneeId) {
      const { data: person, error } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("id", data.assigneeId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!person?.is_active) throw new Error("That user is inactive.");
    }

    const { data: stage, error: stageErr } = await supabaseAdmin
      .from("case_stages")
      .select("id, case_id, name, assignee_id")
      .eq("id", data.stageId)
      .maybeSingle();
    if (stageErr) throw new Error(stageErr.message);
    if (!stage) throw new Error("Stage not found.");

    const { error: updErr } = await supabaseAdmin
      .from("case_stages")
      .update({ assignee_id: data.assigneeId })
      .eq("id", data.stageId);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from("activity_log").insert({
      case_id: stage.case_id,
      actor_id: userId,
      action: "stage_assignee_changed",
      detail: {
        stage_id: stage.id,
        stage_name: stage.name,
        from: stage.assignee_id,
        to: data.assigneeId,
      },
    });

    return { ok: true };
  });

/**
 * Close a case: records a closure summary, sets closed_at, derives
 * retention_until from firm_settings.retention_days, archives all case
 * documents, and logs to activity_log.
 */
export const closeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; closureSummary: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    const summary = (input.closureSummary ?? "").trim();
    if (summary.length < 3) {
      throw new Error("A closure summary is required.");
    }
    return { caseId: input.caseId, closureSummary: summary };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    // Retention period from firm settings.
    const { data: setting } = await supabase
      .from("firm_settings")
      .select("value")
      .eq("key", "retention_days")
      .maybeSingle();
    const retentionDays = Number(setting?.value) || 2555;

    const closedAt = new Date();
    const retentionUntil = new Date(closedAt);
    retentionUntil.setUTCDate(retentionUntil.getUTCDate() + retentionDays);
    const retentionDate = retentionUntil.toISOString().slice(0, 10);

    const { error: caseErr } = await supabase
      .from("cases")
      .update({
        status: "closed",
        closed_at: closedAt.toISOString(),
        retention_until: retentionDate,
        closure_summary: data.closureSummary,
      })
      .eq("id", data.caseId);
    if (caseErr) throw new Error(caseErr.message);

    // Archive all documents on the case.
    const { error: docErr } = await supabase
      .from("documents")
      .update({ is_archived: true })
      .eq("case_id", data.caseId)
      .eq("is_archived", false);
    if (docErr) throw new Error(docErr.message);

    // Activity log (status change is also logged by trigger; this records closure detail).
    const { error: actErr } = await supabase.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: "case_closed",
      detail: {
        closure_summary: data.closureSummary,
        retention_until: retentionDate,
      },
    });
    if (actErr) throw new Error(actErr.message);

    return { ok: true, retention_until: retentionDate };
  });
