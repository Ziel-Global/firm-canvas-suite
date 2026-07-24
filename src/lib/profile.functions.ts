import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MyProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  createdAt: string | null;
}

/**
 * Current user's profile for the Profile page. Available to every signed-in
 * staff role (and any authenticated user with a profiles row).
 */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfile> => {
    const { supabase, userId } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, phone, is_active, two_factor_enabled, created_at",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Profile not found.");

    const { data: authUser, error: authErr } =
      await supabase.auth.getUser();
    if (authErr) throw new Error(authErr.message);

    return {
      id: profile.id as string,
      fullName: (profile.full_name as string | null) ?? null,
      email: authUser.user?.email ?? null,
      phone: (profile.phone as string | null) ?? null,
      role: profile.role as string,
      isActive: Boolean(profile.is_active),
      twoFactorEnabled: Boolean(profile.two_factor_enabled),
      createdAt: (profile.created_at as string | null) ?? null,
    };
  });

const updateSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

/**
 * Self-service update — only name and phone. Role / active status stay
 * admin-controlled.
 */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }): Promise<MyProfile> => {
    const { supabase, userId } = context;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: data.phone ? data.phone : null,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    const { data: profile, error: readErr } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, phone, is_active, two_factor_enabled, created_at",
      )
      .eq("id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!profile) throw new Error("Profile not found.");

    const { data: authUser } = await supabase.auth.getUser();

    return {
      id: profile.id as string,
      fullName: (profile.full_name as string | null) ?? null,
      email: authUser.user?.email ?? null,
      phone: (profile.phone as string | null) ?? null,
      role: profile.role as string,
      isActive: Boolean(profile.is_active),
      twoFactorEnabled: Boolean(profile.two_factor_enabled),
      createdAt: (profile.created_at as string | null) ?? null,
    };
  });
