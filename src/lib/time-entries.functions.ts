import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface TimeEntryRow {
  id: string;
  case_id: string;
  timekeeper_id: string | null;
  timekeeper_name: string | null;
  entry_date: string;
  description: string;
  code: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  rate: number | null;
  status: string;
  timer_started_at: string | null;
}

export interface RunningTimer {
  id: string;
  case_id: string;
  case_title: string | null;
  case_ref: string | null;
  description: string;
  timer_started_at: string;
}

/**
 * Resolves the billing rate for a timekeeper on a matter, most specific wins:
 * case_assignments.billing_rate -> cases.default_hourly_rate ->
 * profiles.default_hourly_rate -> firm_settings.default_hourly_rate.
 */
async function resolveBillingRate(
  supabase: SupabaseClient<Database>,
  caseId: string,
  timekeeperId: string | null,
): Promise<number | null> {
  if (timekeeperId) {
    const { data: assignment } = await supabase
      .from("case_assignments")
      .select("billing_rate")
      .eq("case_id", caseId)
      .eq("user_id", timekeeperId)
      .maybeSingle();
    if (assignment?.billing_rate != null) return assignment.billing_rate;
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("default_hourly_rate")
    .eq("id", caseId)
    .maybeSingle();
  if (caseRow?.default_hourly_rate != null) return caseRow.default_hourly_rate;

  if (timekeeperId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_hourly_rate")
      .eq("id", timekeeperId)
      .maybeSingle();
    if (profile?.default_hourly_rate != null) return profile.default_hourly_rate;
  }

  const { data: setting } = await supabase
    .from("firm_settings")
    .select("value")
    .eq("key", "default_hourly_rate")
    .maybeSingle();
  const firmRate = Number(setting?.value);
  return Number.isFinite(firmRate) && firmRate > 0 ? firmRate : null;
}

function toTimeEntryRow(r: {
  id: string;
  case_id: string;
  timekeeper_id: string | null;
  entry_date: string;
  description: string;
  code: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  rate: number | null;
  status: string;
  timer_started_at: string | null;
  profiles: { full_name: string | null } | null;
}): TimeEntryRow {
  return {
    id: r.id,
    case_id: r.case_id,
    timekeeper_id: r.timekeeper_id,
    timekeeper_name: r.profiles?.full_name ?? null,
    entry_date: r.entry_date,
    description: r.description,
    code: r.code,
    duration_minutes: r.duration_minutes,
    is_billable: r.is_billable,
    rate: r.rate,
    status: r.status,
    timer_started_at: r.timer_started_at,
  };
}

/** List time entries logged against a matter, newest first. */
export const getCaseTimeEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    return { caseId: input.caseId };
  })
  .handler(async ({ data, context }): Promise<TimeEntryRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("time_entries")
      .select(
        "id, case_id, timekeeper_id, entry_date, description, code, duration_minutes, is_billable, rate, status, timer_started_at, profiles!time_entries_timekeeper_id_fkey(full_name)",
      )
      .eq("case_id", data.caseId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toTimeEntryRow);
  });

/** The caller's own open timer, if any, across every matter. */
export const getRunningTimer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RunningTimer | null> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("time_entries")
      .select("id, case_id, description, timer_started_at, cases(title, case_ref)")
      .eq("timekeeper_id", userId)
      .not("timer_started_at", "is", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.timer_started_at) return null;
    const c = data.cases as { title: string | null; case_ref: string | null } | null;
    return {
      id: data.id,
      case_id: data.case_id,
      case_title: c?.title ?? null,
      case_ref: c?.case_ref ?? null,
      description: data.description,
      timer_started_at: data.timer_started_at,
    };
  });

/** Start a live timer on a matter. Only one running timer per user at a time. */
export const startTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    caseId: string;
    description: string;
    code?: string;
    isBillable?: boolean;
  }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.description?.trim()) throw new Error("A description is required.");
    return {
      caseId: input.caseId,
      description: input.description.trim(),
      code: input.code?.trim() || null,
      isBillable: input.isBillable ?? true,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("time_entries")
      .insert({
        case_id: data.caseId,
        timekeeper_id: userId,
        description: data.description,
        code: data.code,
        is_billable: data.isBillable,
        timer_started_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("You already have a timer running. Stop it before starting a new one.");
      }
      throw new Error(error.message);
    }
    return { id: row.id };
  });

/** Stop the caller's running timer, snapshotting the resolved billing rate. */
export const stopTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { timeEntryId: string; description?: string }) => {
    if (!input?.timeEntryId) throw new Error("A time entry id is required.");
    return {
      timeEntryId: input.timeEntryId,
      description: input.description?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }): Promise<{ durationMinutes: number }> => {
    const { supabase } = context;
    const { data: entry, error } = await supabase
      .from("time_entries")
      .select("id, case_id, timekeeper_id, timer_started_at")
      .eq("id", data.timeEntryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entry) throw new Error("Time entry not found.");
    if (!entry.timer_started_at) throw new Error("This timer is not running.");

    const startedAt = new Date(entry.timer_started_at).getTime();
    const durationMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const rate = await resolveBillingRate(supabase, entry.case_id, entry.timekeeper_id);

    const update: Database["public"]["Tables"]["time_entries"]["Update"] = {
      duration_minutes: durationMinutes,
      timer_started_at: null,
      rate,
    };
    if (data.description) update.description = data.description;

    const { error: updErr } = await supabase
      .from("time_entries")
      .update(update)
      .eq("id", data.timeEntryId);
    if (updErr) throw new Error(updErr.message);

    return { durationMinutes };
  });

/** Log time worked after the fact, without a live timer. */
export const createManualTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    caseId: string;
    entryDate: string;
    durationMinutes: number;
    description: string;
    code?: string;
    isBillable?: boolean;
    timekeeperId?: string;
  }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.entryDate) throw new Error("An entry date is required.");
    if (!input?.description?.trim()) throw new Error("A description is required.");
    const minutes = Math.round(Number(input.durationMinutes));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error("Duration must be a positive number of minutes.");
    }
    return {
      caseId: input.caseId,
      entryDate: input.entryDate,
      durationMinutes: minutes,
      description: input.description.trim(),
      code: input.code?.trim() || null,
      isBillable: input.isBillable ?? true,
      timekeeperId: input.timekeeperId || null,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    let timekeeperId = userId;
    if (data.timekeeperId && data.timekeeperId !== userId) {
      const { data: role } = await supabase.rpc("current_role");
      if (role !== "super_admin" && role !== "admin") {
        throw new Error("Only admins can log time on someone else's behalf.");
      }
      timekeeperId = data.timekeeperId;
    }

    const rate = await resolveBillingRate(supabase, data.caseId, timekeeperId);

    const { data: row, error } = await supabase
      .from("time_entries")
      .insert({
        case_id: data.caseId,
        timekeeper_id: timekeeperId,
        entry_date: data.entryDate,
        duration_minutes: data.durationMinutes,
        description: data.description,
        code: data.code,
        is_billable: data.isBillable,
        rate,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** Edit an unbilled time entry. Billed entries are frozen — void the invoice to unlock. */
export const updateTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    id: string;
    entryDate?: string;
    durationMinutes?: number;
    description?: string;
    code?: string;
    isBillable?: boolean;
  }) => {
    if (!input?.id) throw new Error("A time entry id is required.");
    const update: Database["public"]["Tables"]["time_entries"]["Update"] = {};
    if (input.entryDate) update.entry_date = input.entryDate;
    if (input.durationMinutes != null) {
      const minutes = Math.round(Number(input.durationMinutes));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error("Duration must be a positive number of minutes.");
      }
      update.duration_minutes = minutes;
    }
    if (input.description != null) {
      if (!input.description.trim()) throw new Error("A description is required.");
      update.description = input.description.trim();
    }
    if (input.code !== undefined) update.code = input.code?.trim() || null;
    if (input.isBillable != null) update.is_billable = input.isBillable;
    if (Object.keys(update).length === 0) throw new Error("Nothing to update.");
    return { id: input.id, update };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("time_entries")
      .update(data.update, { count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) {
      throw new Error("This time entry has already been billed and can't be edited.");
    }
  });

/** Delete an unbilled time entry. Billed entries are frozen — void the invoice to unlock. */
export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("A time entry id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("time_entries")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) {
      throw new Error("This time entry has already been billed and can't be deleted.");
    }
  });
