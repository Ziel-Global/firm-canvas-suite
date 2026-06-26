import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
  "client",
] as const;

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = 0; i < 12; i++) pwd += pick(all);
  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

// Authorize: caller must be an active super_admin. Returns the caller id.
async function requireSuperAdmin(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string> {
  const { data: me, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!me || me.role !== "super_admin" || !me.is_active) {
    throw new Error("Forbidden: only an active Super Admin can manage users.");
  }
  return userId;
}

async function writeAudit(
  admin: { from: (t: string) => any },
  actorId: string,
  action: string,
  targetId: string,
  detail: Record<string, unknown>,
) {
  await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_table: "profiles",
    target_id: targetId,
    detail,
  });
}

/** Edit a user's role and details. Super Admin only. */
export const updateUserDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().trim().min(1).max(120),
        role: z.enum(APP_ROLES),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const actorId = await requireSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        role: data.role,
        phone: data.phone ? data.phone : null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, actorId, "user_updated", data.userId, {
      full_name: data.fullName,
      role: data.role,
    });

    return { status: "updated" as const };
  });

/** Deactivate a user — sets is_active false (forced sign-out + revocation via 2.9). */
export const deactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const actorId = await requireSuperAdmin(context.supabase, context.userId);
    if (actorId === data.userId) {
      throw new Error("You cannot deactivate your own account.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: false })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    // End any active sessions immediately on the server side.
    try {
      await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    } catch {
      // Best-effort; the next authenticated request is blocked by RLS regardless.
    }

    await writeAudit(supabaseAdmin, actorId, "user_deactivated", data.userId, {});
    return { status: "deactivated" as const };
  });

/** Reactivate a user — sets is_active true. */
export const reactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const actorId = await requireSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: true })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, actorId, "user_reactivated", data.userId, {});
    return { status: "reactivated" as const };
  });

/** Reset a user's password — issues a new temporary password by email (notification). */
export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const actorId = await requireSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: tErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target) throw new Error("User not found.");

    const tempPassword = generateTempPassword();

    const { data: updated, error: upErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: tempPassword },
    );
    if (upErr || !updated.user) {
      throw new Error(`Could not reset password: ${upErr?.message ?? "unknown error"}`);
    }
    const email = updated.user.email ?? "";

    // Queue the new temporary password via the notification system.
    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      type: "password_reset",
      title: "Your password has been reset",
      body:
        `An administrator reset your password. Sign in with your email (${email}) and this ` +
        `temporary password: ${tempPassword}. You will be asked to change it after signing in.`,
      link: "/auth",
    });

    await writeAudit(supabaseAdmin, actorId, "user_password_reset", data.userId, { email });
    return { status: "reset" as const, email };
  });
