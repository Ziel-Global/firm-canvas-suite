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

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, phone, is_active, created_at")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as ProfileRow[];
  });
