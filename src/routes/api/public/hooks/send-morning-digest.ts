import { createFileRoute } from "@tanstack/react-router";

/**
 * Manual / external trigger for morning digest delivery.
 *
 * Auth: publishable/anon key in the `apikey` header.
 * Optional JSON body: { "force": true } to send outside the configured window.
 */
export const Route = createFileRoute("/api/public/hooks/send-morning-digest")({
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

        const body = await request.text();

        const res = await fetch(
          `${supabaseUrl}/functions/v1/send-morning-digest`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              "Content-Type": "application/json",
            },
            body: body || "{}",
          },
        );

        const payload = await res.json().catch(() => ({}));
        return json(payload, res.status);
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
