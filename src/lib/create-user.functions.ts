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

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(255),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(APP_ROLES),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  requireTwoFactor: z.boolean(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Create a new user. Super Admin only. Uses the service role to create the
 * auth user with a manually provided password, insert the profile (with
 * created_by = caller), queue a welcome notification,
 * and write to the immutable audit_log. No self-registration anywhere else.
 */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: caller must be an active super_admin.
    const { data: me, error: meError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (meError) throw new Error(meError.message);
    if (!me || me.role !== "super_admin" || !me.is_active) {
      throw new Error("Forbidden: only an active Super Admin can create users.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create the auth user (email pre-confirmed so they can sign in immediately).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      throw new Error(`Could not create user: ${createError?.message ?? "unknown error"}`);
    }

    const newUserId = created.user.id;

    // Insert the profile row.
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      full_name: data.fullName,
      role: data.role,
      phone: data.phone ? data.phone : null,
      is_active: true,
      two_factor_enabled: data.requireTwoFactor,
      created_by: userId,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(`Could not create profile: ${profileError.message}`);
    }

    // Queue the welcome email via notifications.
    await supabaseAdmin.from("notifications").insert({
      user_id: newUserId,
      type: "welcome_email",
      title: "Welcome to Marlowe & Vance",
      body:
        `Your account has been created. Sign in with your email (${data.email}) and ` +
        `the password provided to you by your administrator.`,
      link: "/auth",
    });

    // Send the actual email
    supabaseAdmin.functions.invoke("send-email", {
      body: {
        to: data.email,
        subject: "Welcome to Firm Canvas - Account Created",
        html: `<p>Hi ${data.fullName},</p><p>Your account has been created by your administrator.</p><p>Sign in with your email (<strong>${data.email}</strong>) and the password provided to you.</p><p><a href="https://firmcanvas.app/auth">Login to Firm Canvas</a></p>`
      }
    }).catch(err => console.error("Failed to send welcome email:", err));

    // Write the creation to the immutable audit log.
    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "user_created",
      target_table: "profiles",
      target_id: newUserId,
      detail: {
        email: data.email,
        full_name: data.fullName,
        role: data.role,
        require_2fa: data.requireTwoFactor,
      },
    });

    return { status: "created" as const, userId: newUserId, email: data.email };
  });
