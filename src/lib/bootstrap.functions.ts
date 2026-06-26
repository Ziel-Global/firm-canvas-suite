import { createServerFn } from "@tanstack/react-start";

// One-time bootstrap credentials for the first Super Admin.
const BOOTSTRAP_EMAIL = "admin@marlowevance.com";
const BOOTSTRAP_PASSWORD = "Marlowe!Vance2026";
const BOOTSTRAP_NAME = "Firm Super Admin";

export const bootstrapSuperAdmin = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Guard: only run when zero profiles exist.
    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (countError) {
      throw new Error(`Could not check existing profiles: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      return { status: "disabled" as const };
    }

    // Create the auth user (email pre-confirmed so they can log in immediately).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
      email_confirm: true,
    });

    if (createError || !created.user) {
      throw new Error(`Could not create auth user: ${createError?.message ?? "unknown error"}`);
    }

    // Create the matching profile row.
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      full_name: BOOTSTRAP_NAME,
      role: "super_admin",
      is_active: true,
    });

    if (profileError) {
      // Roll back the auth user so the bootstrap can be retried cleanly.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(`Could not create profile: ${profileError.message}`);
    }

    return { status: "created" as const, email: BOOTSTRAP_EMAIL };
  },
);
