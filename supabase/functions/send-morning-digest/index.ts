import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Morning digest delivery.
 *
 * Runs on a short cron interval. When the current firm-local time matches
 * firm_settings.morning_digest_time, emails every Super Admin with today's
 * schedule, pending approvals, and overdue tasks.
 *
 * Optional body: { "force": true } to send immediately (ignores time/last-sent).
 */

const FIRM_TZ = Deno.env.get("FIRM_TIMEZONE") || "Asia/Karachi";

function firmNowParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

function startEndOfDayIso(dateStr: string, timeZone: string) {
  // Fixed-offset mapping for common firm zones; default Karachi (UTC+5).
  const offset =
    timeZone === "Asia/Karachi" || timeZone === "Asia/Tashkent"
      ? "+05:00"
      : timeZone === "UTC"
        ? "+00:00"
        : "+05:00";
  const start = new Date(`${dateStr}T00:00:00${offset}`);
  const end = new Date(`${dateStr}T23:59:59.999${offset}`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function parseDigestTime(raw: unknown): string {
  if (typeof raw === "string") return raw.replace(/"/g, "").trim();
  if (raw && typeof raw === "object" && "value" in (raw as object)) {
    return String((raw as { value: unknown }).value).replace(/"/g, "").trim();
  }
  return "07:30";
}

async function getSetting(
  supabase: SupabaseClient,
  key: string,
): Promise<unknown> {
  const { data } = await supabase
    .from("firm_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

async function setSetting(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
) {
  await supabase.from("firm_settings").upsert(
    { key, value: value as string | number | boolean | null },
    { onConflict: "key" },
  );
}

async function buildDigestHtml(
  supabase: SupabaseClient,
  dateStr: string,
  recipientName: string | null,
  timeZone: string,
) {
  const { start, end } = startEndOfDayIso(dateStr, timeZone);

  const { data: events } = await supabase
    .from("calendar_events")
    .select(
      "id, title, event_type, starts_at, ends_at, location, is_private, cases(case_ref, title)",
    )
    .gte("starts_at", start)
    .lte("starts_at", end)
    .order("starts_at", { ascending: true });

  const schedule = events ?? [];

  const { data: approvals } = await supabase
    .from("approvals")
    .select(
      "id, submitted_at, submitted_by, cases(case_ref, title), documents(title)",
    )
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  const submitterIds = [
    ...new Set(
      (approvals ?? [])
        .map((a) => a.submitted_by)
        .filter(Boolean) as string[],
    ),
  ];
  const nameById = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", submitterIds);
    for (const p of people ?? []) {
      if (p.full_name) nameById.set(p.id, p.full_name);
    }
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, priority, due_date, profiles:assignee_id(full_name), cases(case_ref, title)",
    )
    .lt("due_date", dateStr)
    .neq("status", "done")
    .order("due_date", { ascending: true });

  const overdue = (tasks ?? []).filter((t) => t.due_date);

  const section = (title: string, body: string) =>
    `<h2 style="margin:28px 0 10px;font-size:15px;letter-spacing:0.04em;text-transform:uppercase;color:#555;">${title}</h2>${body}`;

  const empty = `<p style="color:#888;font-size:14px;">None.</p>`;

  const scheduleHtml =
    schedule.length === 0
      ? empty
      : `<ul style="padding-left:18px;margin:0;">${schedule
          .map((e) => {
            const c = e.cases as { case_ref: string; title: string } | null;
            const caseBit = c
              ? ` — ${escapeHtml([c.case_ref, c.title].filter(Boolean).join(" · "))}`
              : "";
            const priv = e.is_private ? " (private)" : "";
            return `<li style="margin:6px 0;"><strong>${escapeHtml(fmtTime(e.starts_at as string))}</strong> — ${escapeHtml(e.title ?? "Untitled")}${priv}${caseBit}</li>`;
          })
          .join("")}</ul>`;

  const approvalsHtml =
    (approvals ?? []).length === 0
      ? empty
      : `<ul style="padding-left:18px;margin:0;">${(approvals ?? [])
          .map((a) => {
            const c = a.cases as { case_ref: string; title: string } | null;
            const doc = a.documents as { title: string } | null;
            const who = a.submitted_by
              ? nameById.get(a.submitted_by) ?? "Someone"
              : "Someone";
            const label = doc?.title ?? "Document";
            const caseBit = c
              ? ` (${escapeHtml([c.case_ref, c.title].filter(Boolean).join(" · "))})`
              : "";
            return `<li style="margin:6px 0;">${escapeHtml(label)}${caseBit} — submitted by ${escapeHtml(who)}</li>`;
          })
          .join("")}</ul>`;

  const overdueHtml =
    overdue.length === 0
      ? empty
      : `<ul style="padding-left:18px;margin:0;">${overdue
          .map((t) => {
            const c = t.cases as { case_ref: string; title: string } | null;
            const a = t.profiles as { full_name: string } | null;
            const caseBit = c
              ? ` — ${escapeHtml([c.case_ref, c.title].filter(Boolean).join(" · "))}`
              : "";
            const assignee = a?.full_name
              ? ` (${escapeHtml(a.full_name)})`
              : "";
            return `<li style="margin:6px 0;"><strong>${escapeHtml(t.title)}</strong> due ${escapeHtml(t.due_date as string)}${assignee}${caseBit}</li>`;
          })
          .join("")}</ul>`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#888;">Morning Digest</p>
  <h1 style="margin:0 0 6px;font-size:22px;">${escapeHtml(fmtDate(dateStr))}</h1>
  <p style="margin:0 0 20px;color:#555;">Good morning${recipientName ? `, ${escapeHtml(recipientName)}` : ""}.</p>
  <p style="margin:0;padding:12px 14px;background:#f5f5f5;border-radius:8px;font-size:14px;">
    <strong>${schedule.length}</strong> events ·
    <strong>${(approvals ?? []).length}</strong> pending approvals ·
    <strong>${overdue.length}</strong> overdue tasks
  </p>
  ${section("Today's schedule", scheduleHtml)}
  ${section("Pending approvals", approvalsHtml)}
  ${section("Overdue tasks", overdueHtml)}
  <p style="margin-top:32px;font-size:12px;color:#999;">
    Firm Operations Portal · <a href="https://firmcanvas.app/">Open dashboard</a>
  </p>
</body></html>`;

  return {
    html,
    totals: {
      schedule: schedule.length,
      pending_approvals: (approvals ?? []).length,
      overdue_tasks: overdue.length,
    },
  };
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        force = Boolean(body?.force);
      } catch {
        // empty body is fine
      }
    }

    const { date: today, hhmm } = firmNowParts(FIRM_TZ);
    const digestTimeRaw = await getSetting(supabase, "morning_digest_time");
    const digestTime = parseDigestTime(digestTimeRaw);
    const lastSent = parseDigestTime(
      await getSetting(supabase, "morning_digest_last_sent"),
    );

    if (!force) {
      if (hhmm !== digestTime) {
        return json({
          sent: false,
          reason: "outside_digest_window",
          now: hhmm,
          configured: digestTime,
          timezone: FIRM_TZ,
        });
      }
      if (lastSent === today) {
        return json({
          sent: false,
          reason: "already_sent_today",
          date: today,
          configured: digestTime,
        });
      }
    }

    const { data: admins } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "super_admin")
      .eq("is_active", true);

    if (!admins?.length) {
      return json({ sent: false, reason: "no_super_admins" });
    }

    let emailed = 0;
    const errors: string[] = [];
    let totals = { schedule: 0, pending_approvals: 0, overdue_tasks: 0 };

    for (const admin of admins) {
      const { data: authUser } = await supabase.auth.admin.getUserById(admin.id);
      const email = authUser?.user?.email;
      if (!email) {
        errors.push(`${admin.id}: no email`);
        continue;
      }

      const digest = await buildDigestHtml(
        supabase,
        today,
        admin.full_name,
        FIRM_TZ,
      );
      totals = digest.totals;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          subject: `Morning Digest — ${fmtDate(today)}`,
          html: digest.html,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errors.push(
          `${email}: ${(data as { error?: string }).error || res.status}`,
        );
        continue;
      }
      emailed++;
    }

    if (emailed > 0) {
      await setSetting(supabase, "morning_digest_last_sent", today);
    }

    return json({
      sent: emailed > 0,
      force,
      date: today,
      configured: digestTime,
      timezone: FIRM_TZ,
      now: hhmm,
      emailed,
      totals,
      errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("send-morning-digest failed:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
