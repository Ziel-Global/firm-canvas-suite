import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReminderChannel = "email" | "sms" | "in_app";

export interface ReminderDefault {
  id: string;
  event_type: string;
  offsets: number[];
  channels: ReminderChannel[];
}

export interface EventReminder {
  offset_minutes: number;
  channel: ReminderChannel;
}

/** Firm-wide reminder defaults, one row per event type. Readable by all active staff. */
export const getReminderDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderDefault[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("event_reminder_defaults")
      .select("id, event_type, offsets, channels")
      .order("event_type", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ReminderDefault[];
  });

/** Update the default offsets/channels for an event type (super_admin / admin only via RLS). */
export const updateReminderDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      event_type: string;
      offsets: number[];
      channels: ReminderChannel[];
    }) => input,
  )
  .handler(async ({ data, context }): Promise<ReminderDefault> => {
    const { supabase } = context;
    const offsets = Array.from(new Set(data.offsets.filter((n) => n > 0))).sort(
      (a, b) => b - a,
    );
    const channels = Array.from(new Set(data.channels));
    const { data: updated, error } = await supabase
      .from("event_reminder_defaults")
      .update({ offsets, channels })
      .eq("event_type", data.event_type)
      .select("id, event_type, offsets, channels")
      .single();
    if (error) throw new Error(error.message);
    return updated as ReminderDefault;
  });

/** Reminders configured for a specific event. */
export const getEventReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_id: string }) => input)
  .handler(async ({ data, context }): Promise<EventReminder[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("event_reminders")
      .select("offset_minutes, channel")
      .eq("event_id", data.event_id)
      .order("offset_minutes", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as EventReminder[];
  });

/** Replace all reminders for an event with the supplied set. */
export const setEventReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { event_id: string; reminders: EventReminder[] }) => input,
  )
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const { supabase } = context;

    const { error: delError } = await supabase
      .from("event_reminders")
      .delete()
      .eq("event_id", data.event_id);
    if (delError) throw new Error(delError.message);

    // De-duplicate offset/channel pairs
    const seen = new Set<string>();
    const rows = data.reminders
      .filter((r) => {
        const key = `${r.offset_minutes}:${r.channel}`;
        if (r.offset_minutes <= 0 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({
        event_id: data.event_id,
        offset_minutes: r.offset_minutes,
        channel: r.channel,
        sent: false,
      }));

    if (rows.length === 0) return { count: 0 };

    const { error: insError } = await supabase
      .from("event_reminders")
      .insert(rows);
    if (insError) throw new Error(insError.message);

    return { count: rows.length };
  });
