import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CalendarEvent {
  id: string;
  title: string | null;
  description: string | null;
  case_id: string | null;
  case_ref: string | null;
  event_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  is_private: boolean | null;
  owner_id: string | null;
}

/** List events within an inclusive ISO date range [from, to]. */
export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data, context }): Promise<CalendarEvent[]> => {
    const { supabase } = context;

    const { data: events, error } = await supabase
      .from("calendar_events")
      .select(
        "id, title, description, case_id, event_type, starts_at, ends_at, location, is_private, owner_id, cases(case_ref)",
      )
      .gte("starts_at", data.from)
      .lte("starts_at", data.to)
      .order("starts_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (events ?? []).map((e) => {
      const { cases, ...rest } = e as typeof e & {
        cases: { case_ref: string } | null;
      };
      return { ...rest, case_ref: cases?.case_ref ?? null } as CalendarEvent;
    });
  });

export interface CalendarCaseOption {
  id: string;
  case_ref: string;
  title: string | null;
}

export const getCalendarOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarCaseOption[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cases")
      .select("id, case_ref, title")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as CalendarCaseOption[];
  });

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      title: string;
      description?: string | null;
      case_id?: string | null;
      event_type?: string | null;
      location?: string | null;
      starts_at: string;
      ends_at: string;
      is_private?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<CalendarEvent> => {
    const { supabase, userId } = context;

    const { data: created, error } = await supabase
      .from("calendar_events")
      .insert({
        title: data.title,
        description: data.description ?? null,
        case_id: data.case_id ?? null,
        event_type: data.event_type ?? "meeting",
        location: data.location ?? null,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        is_private: data.is_private ?? false,
        owner_id: userId,
      })
      .select(
        "id, title, description, case_id, event_type, starts_at, ends_at, location, is_private, owner_id",
      )
      .single();

    if (error) throw new Error(error.message);
    return { ...created, case_ref: null } as CalendarEvent;
  });
