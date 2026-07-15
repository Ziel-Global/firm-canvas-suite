import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled / manual hook for workflow escalation.
 *
 * Finds active case stages whose deadline has passed, escalates an alert to
 * every Super Admin (in-app + email), and recomputes each affected case's health:
 *   - 1–2 days overdue  -> at_risk
 *   - 3+ days overdue   -> overdue
 *
 * Cases with no overdue active stage are returned to on_track.
 *
 * Prefer invoking the escalate-overdue-stages edge function (used by pg_cron).
 * This route proxies that function for local / API-key based triggers.
 *
 * Auth: publishable/anon key in the `apikey` header.
 */
export const Route = createFileRoute("/api/public/hooks/escalate-overdue-stages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace("Bearer ", "");

        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return json({ error: "Unauthorized" }, 401);
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          return json({ error: "Missing Supabase environment variables" }, 500);
        }

        const res = await fetch(
          `${supabaseUrl}/functions/v1/escalate-overdue-stages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              "Content-Type": "application/json",
            },
            body: "{}",
          },
        );

        const body = await res.json().catch(() => ({}));
        return json(body, res.status);
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
