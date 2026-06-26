import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Live access check executed on each authenticated request.
 *
 * Runs as the signed-in user (RLS applies). It asks the database whether the
 * user is still an active user via the security-definer `is_active_user()`
 * helper. If the account has been deactivated, or the session no longer
 * satisfies access, this returns `{ active: false }` and the client signs the
 * user out immediately. RLS — not this check — is what blocks the data; this
 * simply forces the session to end so a revoked user cannot keep a stale UI.
 */
export const verifyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase.rpc("is_active_user");
    if (error) {
      // If we cannot confirm the user is active, treat as revoked.
      return { active: false as const };
    }

    return { active: Boolean(data), userId };
  });
