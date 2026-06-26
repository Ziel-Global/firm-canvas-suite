import { createServerFn } from "@tanstack/react-start";

const DEFAULT_MAX_FAILED = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

async function getSetting(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  key: string,
  fallback: number,
): Promise<number> {
  const { data } = await admin
    .from("firm_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Pre-sign-in check: is this email currently locked out?
 * Returns the remaining cooldown in seconds when locked.
 */
export const checkLockout = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => ({ email: normalize(input.email) }))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("login_attempts")
      .select("locked_until")
      .eq("email", data.email)
      .maybeSingle();

    if (!row?.locked_until) return { locked: false as const };

    const until = new Date(row.locked_until).getTime();
    const now = Date.now();
    if (until > now) {
      return { locked: true as const, retryAfterSeconds: Math.ceil((until - now) / 1000) };
    }
    return { locked: false as const };
  });

/**
 * Record a failed sign-in. Increments the consecutive failure counter and,
 * once it reaches max_failed_logins, locks the account for lockout_minutes.
 */
export const recordFailedLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => ({ email: normalize(input.email) }))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const [maxFailed, lockoutMinutes] = await Promise.all([
      getSetting(admin, "max_failed_logins", DEFAULT_MAX_FAILED),
      getSetting(admin, "lockout_minutes", DEFAULT_LOCKOUT_MINUTES),
    ]);

    const { data: existing } = await admin
      .from("login_attempts")
      .select("failed_count, locked_until")
      .eq("email", data.email)
      .maybeSingle();

    const now = Date.now();
    const stillLocked =
      existing?.locked_until && new Date(existing.locked_until).getTime() > now;

    // Reset count if a previous lock has expired.
    const baseCount = stillLocked
      ? existing!.failed_count
      : existing && existing.locked_until && new Date(existing.locked_until).getTime() <= now
        ? 0
        : existing?.failed_count ?? 0;

    const nextCount = baseCount + 1;
    const shouldLock = nextCount >= maxFailed;
    const lockedUntil = shouldLock
      ? new Date(now + lockoutMinutes * 60 * 1000).toISOString()
      : stillLocked
        ? existing!.locked_until
        : null;

    await admin.from("login_attempts").upsert(
      {
        email: data.email,
        failed_count: nextCount,
        locked_until: lockedUntil,
        last_failed_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "email" },
    );

    if (shouldLock) {
      return {
        locked: true as const,
        retryAfterSeconds: lockoutMinutes * 60,
        attemptsRemaining: 0,
      };
    }
    return {
      locked: false as const,
      attemptsRemaining: Math.max(0, maxFailed - nextCount),
    };
  });

/**
 * Clear the failure counter after a successful sign-in.
 */
export const clearFailedLogins = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => ({ email: normalize(input.email) }))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    await admin.from("login_attempts").delete().eq("email", data.email);
    return { ok: true as const };
  });
