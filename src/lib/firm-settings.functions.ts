import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dispatched in the browser when session timeout is saved so AuthProvider applies it live. */
export {
  SESSION_TIMEOUT_CHANGED_EVENT,
  notifySessionTimeoutChanged,
} from "@/lib/firm-settings-events";

export const FIRM_SETTING_KEYS = [
  "retention_days",
  "session_timeout_minutes",
  "reminder_offsets",
  "morning_digest_time",
  "max_failed_logins",
  "lockout_minutes",
] as const;

export type FirmSettingKey = (typeof FIRM_SETTING_KEYS)[number];

export interface FirmSettingsValues {
  retention_days: number;
  session_timeout_minutes: number;
  reminder_offsets: number[];
  morning_digest_time: string;
  max_failed_logins: number;
  lockout_minutes: number;
}

export const FIRM_SETTING_DEFAULTS: FirmSettingsValues = {
  retention_days: 2555,
  session_timeout_minutes: 30,
  reminder_offsets: [10080, 1440, 120],
  morning_digest_time: "07:30",
  max_failed_logins: 5,
  lockout_minutes: 15,
};

function asNumber(value: Json | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asTimeString(value: Json | null | undefined, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.replace(/^"|"$/g, "").trim();
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const [h, m] = trimmed.split(":");
      return `${h.padStart(2, "0")}:${m}`;
    }
  }
  return fallback;
}

function asNumberArray(value: Json | null | undefined, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const nums = value
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n));
  return nums.length > 0 ? nums : fallback;
}

/**
 * Load firm policy knobs from firm_settings (super_admin / admin read via RLS;
 * session timeout is also readable by all active staff).
 */
export const getFirmSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FirmSettingsValues> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("firm_settings")
      .select("key, value")
      .in("key", [...FIRM_SETTING_KEYS]);
    if (error) throw new Error(error.message);

    const map = new Map<string, Json | null>();
    for (const row of data ?? []) {
      if (row.key) map.set(row.key, row.value);
    }

    return {
      retention_days: asNumber(
        map.get("retention_days"),
        FIRM_SETTING_DEFAULTS.retention_days,
      ),
      session_timeout_minutes: asNumber(
        map.get("session_timeout_minutes"),
        FIRM_SETTING_DEFAULTS.session_timeout_minutes,
      ),
      reminder_offsets: asNumberArray(
        map.get("reminder_offsets"),
        FIRM_SETTING_DEFAULTS.reminder_offsets,
      ),
      morning_digest_time: asTimeString(
        map.get("morning_digest_time"),
        FIRM_SETTING_DEFAULTS.morning_digest_time,
      ),
      max_failed_logins: asNumber(
        map.get("max_failed_logins"),
        FIRM_SETTING_DEFAULTS.max_failed_logins,
      ),
      lockout_minutes: asNumber(
        map.get("lockout_minutes"),
        FIRM_SETTING_DEFAULTS.lockout_minutes,
      ),
    };
  });

export const updateFirmSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Partial<FirmSettingsValues>) => {
    const next: Partial<FirmSettingsValues> = {};

    if (input.retention_days != null) {
      const n = Math.round(Number(input.retention_days));
      if (!Number.isFinite(n) || n < 30 || n > 36500) {
        throw new Error("Retention must be between 30 and 36,500 days.");
      }
      next.retention_days = n;
    }

    if (input.session_timeout_minutes != null) {
      const n = Math.round(Number(input.session_timeout_minutes));
      if (!Number.isFinite(n) || n < 5 || n > 1440) {
        throw new Error("Session timeout must be between 5 and 1,440 minutes.");
      }
      next.session_timeout_minutes = n;
    }

    if (input.reminder_offsets != null) {
      if (!Array.isArray(input.reminder_offsets) || input.reminder_offsets.length === 0) {
        throw new Error("At least one reminder offset is required.");
      }
      const offsets = input.reminder_offsets
        .map((v) => Math.round(Number(v)))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (offsets.length === 0) {
        throw new Error("Reminder offsets must be positive minutes.");
      }
      next.reminder_offsets = Array.from(new Set(offsets)).sort((a, b) => b - a);
    }

    if (input.morning_digest_time != null) {
      const t = String(input.morning_digest_time).trim();
      if (!/^\d{1,2}:\d{2}$/.test(t)) {
        throw new Error("Morning digest time must be HH:MM (24-hour).");
      }
      const [hRaw, mRaw] = t.split(":");
      const h = Number(hRaw);
      const m = Number(mRaw);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        throw new Error("Morning digest time is out of range.");
      }
      next.morning_digest_time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    if (input.max_failed_logins != null) {
      const n = Math.round(Number(input.max_failed_logins));
      if (!Number.isFinite(n) || n < 3 || n > 20) {
        throw new Error("Failed-login threshold must be between 3 and 20.");
      }
      next.max_failed_logins = n;
    }

    if (input.lockout_minutes != null) {
      const n = Math.round(Number(input.lockout_minutes));
      if (!Number.isFinite(n) || n < 1 || n > 1440) {
        throw new Error("Lockout duration must be between 1 and 1,440 minutes.");
      }
      next.lockout_minutes = n;
    }

    if (Object.keys(next).length === 0) {
      throw new Error("No settings to update.");
    }
    return next;
  })
  .handler(async ({ data, context }): Promise<FirmSettingsValues> => {
    const { supabase, userId } = context;

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (profile?.role !== "super_admin") {
      throw new Error("Only the Super Admin can change firm settings.");
    }

    const entries = Object.entries(data) as [FirmSettingKey, number | number[] | string][];
    for (const [key, value] of entries) {
      const { error } = await supabase.from("firm_settings").upsert(
        { key, value: value as Json },
        { onConflict: "key" },
      );
      if (error) throw new Error(error.message);
    }

    // Keep per-type reminder defaults in sync with the firm-wide offsets list.
    if (data.reminder_offsets) {
      const { data: defaults, error: defaultsErr } = await supabase
        .from("event_reminder_defaults")
        .select("id, channels");
      if (defaultsErr) throw new Error(defaultsErr.message);
      for (const row of defaults ?? []) {
        const { error: updErr } = await supabase
          .from("event_reminder_defaults")
          .update({ offsets: data.reminder_offsets })
          .eq("id", row.id);
        if (updErr) throw new Error(updErr.message);
      }
    }

    const { data: rows, error: readErr } = await supabase
      .from("firm_settings")
      .select("key, value")
      .in("key", [...FIRM_SETTING_KEYS]);
    if (readErr) throw new Error(readErr.message);

    const map = new Map<string, Json | null>();
    for (const row of rows ?? []) {
      if (row.key) map.set(row.key, row.value);
    }

    return {
      retention_days: asNumber(
        map.get("retention_days"),
        FIRM_SETTING_DEFAULTS.retention_days,
      ),
      session_timeout_minutes: asNumber(
        map.get("session_timeout_minutes"),
        FIRM_SETTING_DEFAULTS.session_timeout_minutes,
      ),
      reminder_offsets: asNumberArray(
        map.get("reminder_offsets"),
        FIRM_SETTING_DEFAULTS.reminder_offsets,
      ),
      morning_digest_time: asTimeString(
        map.get("morning_digest_time"),
        FIRM_SETTING_DEFAULTS.morning_digest_time,
      ),
      max_failed_logins: asNumber(
        map.get("max_failed_logins"),
        FIRM_SETTING_DEFAULTS.max_failed_logins,
      ),
      lockout_minutes: asNumber(
        map.get("lockout_minutes"),
        FIRM_SETTING_DEFAULTS.lockout_minutes,
      ),
    };
  });
