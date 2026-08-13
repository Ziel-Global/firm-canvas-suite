import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReminderChannel = "email" | "sms" | "in_app";

interface CalendarEventRow {
  id: string;
  title: string | null;
  event_type: string | null;
  starts_at: string;
  location: string | null;
  owner_id: string | null;
  case_id: string | null;
  cases: { case_ref: string | null; title: string | null } | null;
}

interface DueReminderRow {
  id: string;
  offset_minutes: number;
  channel: ReminderChannel;
  calendar_events: CalendarEventRow;
}

function formatOffset(minutes: number): string {
  if (minutes % 1440 === 0) {
    const value = minutes / 1440;
    return `${value} day${value === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const value = minutes / 60;
    return `${value} hour${value === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isDue(startsAtIso: string, offsetMinutes: number, now: Date): boolean {
  const startsAt = new Date(startsAtIso);
  const dueAt = new Date(startsAt.getTime() - offsetMinutes * 60_000);
  return now >= dueAt && now < startsAt;
}

async function invokeFunction(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
  body: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to invoke ${name} (${res.status})`,
    );
  }
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();

    const { data: reminders, error } = await supabase
      .from("event_reminders")
      .select(
        `
        id,
        offset_minutes,
        channel,
        calendar_events (
          id,
          title,
          event_type,
          starts_at,
          location,
          owner_id,
          case_id,
          cases (case_ref, title)
        )
      `,
      )
      .eq("sent", false);

    if (error) throw error;

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const errors: { reminderId: string; error: string }[] = [];

    for (const row of (reminders ?? []) as DueReminderRow[]) {
      const event = row.calendar_events;
      if (!event?.starts_at || !event.owner_id) {
        skipped++;
        continue;
      }

      if (!isDue(event.starts_at, row.offset_minutes, now)) {
        continue;
      }

      processed++;

      const { data: claimed, error: claimErr } = await supabase
        .from("event_reminders")
        .update({ sent: true })
        .eq("id", row.id)
        .eq("sent", false)
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed) continue;

      const offsetLabel = formatOffset(row.offset_minutes);
      const eventTitle = event.title?.trim() || "Calendar event";
      const eventTime = formatEventTime(event.starts_at);
      const caseLabel = event.cases
        ? [event.cases.case_ref, event.cases.title].filter(Boolean).join(" · ")
        : null;
      const locationSuffix = event.location ? ` at ${event.location}` : "";
      const link = "/calendar";

      const title = `Reminder: ${eventTitle}`;
      const body = `${eventTitle} starts ${eventTime} (${offsetLabel} from now)${locationSuffix}${
        caseLabel ? `. Matter: ${caseLabel}.` : "."
      }`;

      try {
        if (row.channel === "in_app") {
          const { error: notifErr } = await supabase.from("notifications").insert({
            user_id: event.owner_id,
            type: "event_reminder",
            title,
            body,
            link,
          });
          if (notifErr) throw notifErr;
        } else {
          const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select("full_name, phone, is_active")
            .eq("id", event.owner_id)
            .maybeSingle();

          if (profileErr) throw profileErr;
          if (!profile?.is_active) {
            throw new Error("Event owner is inactive");
          }

          if (row.channel === "email") {
            const { data: authUser, error: authErr } = await supabase.auth.admin
              .getUserById(event.owner_id);
            if (authErr) throw authErr;

            const email = authUser.user?.email;
            if (!email) throw new Error("Event owner has no email");

            await invokeFunction(supabaseUrl, supabaseServiceKey, "send-email", {
              to: email,
              subject: title,
              html: `<p>Hi ${profile.full_name || "there"},</p><p>${body}</p><p><a href="https://firmcanvas.app/calendar">View calendar</a></p>`,
            });
          }

          if (row.channel === "sms") {
            const phone = profile.phone?.trim();
            if (!phone) throw new Error("Event owner has no phone number");

            await invokeFunction(supabaseUrl, supabaseServiceKey, "send-sms", {
              to: phone,
              body: `${title} — ${body}`,
            });
          }
        }

        sent++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push({ reminderId: row.id, error: message });

        await supabase
          .from("event_reminders")
          .update({ sent: false })
          .eq("id", row.id);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Reminder processing complete",
        checked: reminders?.length ?? 0,
        processed,
        sent,
        skipped,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("process-reminders failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
