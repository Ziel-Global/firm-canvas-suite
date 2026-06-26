import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CASE_STATUSES = ["intake", "active", "on_hold", "closed"] as const;
type CaseStatus = (typeof CASE_STATUSES)[number];

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
  .inputValidator((input: { caseId: string; status: CaseStatus }) => {
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
 * Reassign the lead. Removes the previous lead's assignment. If
 * `keepReadOnly` is set, the previous lead is granted a read-only access
 * override so they retain visibility. Writes to activity_log and audit_log.
 */
export const reassignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    caseId: string;
    newLeadId: string;
    keepReadOnly: boolean;
  }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.newLeadId) throw new Error("A new lead is required.");
    return {
      caseId: input.caseId,
      newLeadId: input.newLeadId,
      keepReadOnly: Boolean(input.keepReadOnly),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    // Find the current lead, if any.
    const { data: currentLead, error: leadErr } = await supabase
      .from("case_assignments")
      .select("id, user_id")
      .eq("case_id", data.caseId)
      .eq("is_lead", true)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);

    const previousLeadId: string | null = currentLead?.user_id ?? null;

    if (previousLeadId === data.newLeadId) {
      return { ok: true, unchanged: true };
    }

    // Remove the previous lead assignment entirely.
    if (currentLead?.id) {
      const { error: delErr } = await supabase
        .from("case_assignments")
        .delete()
        .eq("id", currentLead.id);
      if (delErr) throw new Error(delErr.message);

      if (data.keepReadOnly && previousLeadId) {
        // Upsert a read-only override for the previous lead.
        const { error: delOv } = await supabase
          .from("case_access_overrides")
          .delete()
          .eq("case_id", data.caseId)
          .eq("user_id", previousLeadId);
        if (delOv) throw new Error(delOv.message);

        const { error: ovErr } = await supabase
          .from("case_access_overrides")
          .insert({
            case_id: data.caseId,
            user_id: previousLeadId,
            access_level: "read_only",
            granted_by: userId,
            note: "Retained read-only access after lead reassignment.",
          });
        if (ovErr) throw new Error(ovErr.message);
      }
    }

    // Assign the new lead (remove any existing assignment row first to avoid dupes).
    const { error: clearErr } = await supabase
      .from("case_assignments")
      .delete()
      .eq("case_id", data.caseId)
      .eq("user_id", data.newLeadId);
    if (clearErr) throw new Error(clearErr.message);

    const { error: insErr } = await supabase
      .from("case_assignments")
      .insert({
        case_id: data.caseId,
        user_id: data.newLeadId,
        role_on_case: "lead",
        is_lead: true,
        assigned_by: userId,
      });
    if (insErr) throw new Error(insErr.message);

    // Activity log (case-scoped).
    const { error: actErr } = await supabase.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: "lead_reassigned",
      detail: {
        previous_lead: previousLeadId,
        new_lead: data.newLeadId,
        kept_read_only: data.keepReadOnly,
      },
    });
    if (actErr) throw new Error(actErr.message);

    // Audit log (access change).
    const { error: audErr } = await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "case_lead_reassigned",
      target_table: "case_assignments",
      target_id: data.caseId,
      detail: {
        previous_lead: previousLeadId,
        new_lead: data.newLeadId,
        kept_read_only: data.keepReadOnly,
      },
    });
    if (audErr) throw new Error(audErr.message);

    return { ok: true };
  });

/**
 * Close a case: records a closure summary, sets closed_at, derives
 * retention_until from firm_settings.retention_days, archives all case
 * documents, and logs to activity_log.
 */
export const closeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caseId: string; closureSummary: string }) => {
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
