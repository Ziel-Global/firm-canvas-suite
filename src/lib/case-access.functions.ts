import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACCESS_LEVELS = ["read_only", "full", "none"] as const;
type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Valid case folder codes for scoping access. */
const FOLDER_CODES = ["01", "02", "03", "04", "05", "06", "07"] as const;

/** Ensure the caller is an active super_admin; throws otherwise. */
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (!isAdmin) throw new Error("Only an active Super Admin can perform this action.");
}

function normalizeFolderScope(input: string[] | string | null | undefined): string | null {
  if (input == null) return null;
  const arr = Array.isArray(input)
    ? input
    : String(input)
        .split(",")
        .map((s) => s.trim());
  const codes = arr
    .map((c) => c.trim())
    .filter((c) => (FOLDER_CODES as readonly string[]).includes(c));
  if (codes.length === 0) return null;
  // Stable order, de-duplicated.
  return Array.from(new Set(codes)).sort().join(",");
}

/**
 * Create or update a case-specific access override for a user.
 * - access_level `full` / `read_only` grants access regardless of role default.
 * - access_level `none` restricts the user even if their role would allow access.
 * - folder_scope (codes like "06") narrows the user to specific folders;
 *   null/empty means all folders the user can otherwise reach.
 *
 * Writes to case_access_overrides (via RLS as super_admin) and audit_log.
 * Effect is immediate: every RLS helper reads case_access_overrides live.
 */
export const setCaseAccessOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    caseId: string;
    targetUserId: string;
    accessLevel: AccessLevel;
    folderScope?: string[] | string | null;
    note?: string | null;
  }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.targetUserId) throw new Error("A user is required.");
    if (!ACCESS_LEVELS.includes(input.accessLevel)) {
      throw new Error("Invalid access level.");
    }
    return {
      caseId: input.caseId,
      targetUserId: input.targetUserId,
      accessLevel: input.accessLevel,
      // folder scope only meaningful when the user has some access
      folderScope:
        input.accessLevel === "none" ? null : normalizeFolderScope(input.folderScope),
      note: (input.note ?? "").trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    if (data.targetUserId === userId) {
      throw new Error("You cannot override your own access.");
    }

    // Capture prior state for the audit trail.
    const { data: prior } = await supabase
      .from("case_access_overrides")
      .select("access_level, folder_scope")
      .eq("case_id", data.caseId)
      .eq("user_id", data.targetUserId)
      .maybeSingle();

    // Replace any existing override for this (case, user).
    const { error: delErr } = await supabase
      .from("case_access_overrides")
      .delete()
      .eq("case_id", data.caseId)
      .eq("user_id", data.targetUserId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabase
      .from("case_access_overrides")
      .insert({
        case_id: data.caseId,
        user_id: data.targetUserId,
        access_level: data.accessLevel,
        folder_scope: data.folderScope,
        granted_by: userId,
        note: data.note,
      });
    if (insErr) throw new Error(insErr.message);

    // Audit log (access change).
    const { error: audErr } = await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "case_access_override_set",
      target_table: "case_access_overrides",
      target_id: data.caseId,
      detail: {
        case_id: data.caseId,
        user_id: data.targetUserId,
        from: prior
          ? { access_level: prior.access_level, folder_scope: prior.folder_scope }
          : null,
        to: { access_level: data.accessLevel, folder_scope: data.folderScope },
        note: data.note,
      },
    });
    if (audErr) throw new Error(audErr.message);

    return { ok: true, revoked: data.accessLevel === "none" };
  });

/**
 * Remove a case-specific override, reverting the user to their role default.
 * Writes to audit_log.
 */
export const clearCaseAccessOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; targetUserId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    if (!input?.targetUserId) throw new Error("A user is required.");
    return { caseId: input.caseId, targetUserId: input.targetUserId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    const { data: prior } = await supabase
      .from("case_access_overrides")
      .select("access_level, folder_scope")
      .eq("case_id", data.caseId)
      .eq("user_id", data.targetUserId)
      .maybeSingle();

    if (!prior) return { ok: true, unchanged: true };

    const { error: delErr } = await supabase
      .from("case_access_overrides")
      .delete()
      .eq("case_id", data.caseId)
      .eq("user_id", data.targetUserId);
    if (delErr) throw new Error(delErr.message);

    const { error: audErr } = await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "case_access_override_cleared",
      target_table: "case_access_overrides",
      target_id: data.caseId,
      detail: {
        case_id: data.caseId,
        user_id: data.targetUserId,
        from: { access_level: prior.access_level, folder_scope: prior.folder_scope },
        to: null,
      },
    });
    if (audErr) throw new Error(audErr.message);

    return { ok: true };
  });

/**
 * Lightweight check of the current user's effective access to a case.
 * Used by the case detail view to enforce immediate sign-out from a case
 * when an override revokes access.
 */
export const getMyCaseAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A case id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<{ level: string }> => {
    const { supabase } = context;
    const { data: level, error } = await supabase.rpc("effective_case_access", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);
    return { level: (level as string) ?? "none" };
  });
