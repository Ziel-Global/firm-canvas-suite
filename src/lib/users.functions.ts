import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  role: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * List all profiles. RLS restricts SELECT on `profiles` to super_admin, so a
 * non-super-admin caller simply receives an empty list — the database, not the
 * UI, enforces access.
 */
export const listProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileRow[]> => {
    const { supabase } = context;

    // Internal directory only — client portal accounts are not firm users.
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, phone, is_active, created_at")
      .neq("role", "client")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as ProfileRow[];
  });

const ASSIGNABLE_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
] as const;

/**
 * Active staff that can be assigned as case lead / stage owner.
 * Admins and super admins may call this; the list is loaded via service role
 * after an explicit role check (profiles RLS otherwise hides peers from admins).
 */
export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileRow[]> => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: me, error: meErr } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    if (
      !me?.is_active ||
      (me.role !== "super_admin" && me.role !== "admin")
    ) {
      throw new Error("Only admins can list assignable staff.");
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, phone, is_active, created_at")
      .eq("is_active", true)
      .in("role", [...ASSIGNABLE_ROLES])
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProfileRow[];
  });
