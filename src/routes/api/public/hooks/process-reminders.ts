import { createFileRoute } from "@tanstack/react-router";

/**
 * Manual / external trigger for the reminder scheduler.
 *
 * Calls the process-reminders edge function, which checks unsent event_reminders
 * and dispatches due reminders (7 days, 24 hours, 2 hours before each event)
 * across email, SMS, and in-app channels, marking each row sent on success.
 *
 * Auth: publishable/anon key in the `apikey` header (same pattern as other hooks).
 */
export const Route = createFileRoute("/api/public/hooks/process-reminders")({
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

        const res = await fetch(`${supabaseUrl}/functions/v1/process-reminders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: "{}",
        });

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
