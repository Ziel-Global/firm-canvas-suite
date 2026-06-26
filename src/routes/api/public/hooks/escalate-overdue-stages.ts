import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled hook (runs hourly via pg_cron).
 *
 * Finds active case stages whose deadline has passed, escalates an alert to
 * every Super Admin, and recomputes each affected case's health:
 *   - 1–2 days overdue  -> at_risk
 *   - 3+ days overdue   -> overdue
 *
 * Cases with no overdue active stage are returned to on_track.
 *
 * Auth: this lives under /api/public/* (auth bypassed at the edge), so the
 * caller must present the project's publishable/anon key in the `apikey`
 * header. All work uses the service-role client.
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

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Open (non-closed) cases.
        const { data: openCases, error: caseErr } = await supabaseAdmin
          .from("cases")
          .select("id, case_ref, title, health")
          .neq("status", "closed");
        if (caseErr) return json({ error: caseErr.message }, 500);

        const caseMap = new Map(
          (openCases ?? []).map((c) => [c.id, c]),
        );
        const openIds = [...caseMap.keys()];
        if (openIds.length === 0) {
          return json({ processed: 0, updated: 0, escalated: 0 });
        }

        // 2. Active stages for those cases that have a deadline.
        const { data: stages, error: stageErr } = await supabaseAdmin
          .from("case_stages")
          .select("id, case_id, name, deadline, assignee_id")
          .eq("status", "active")
          .in("case_id", openIds)
          .not("deadline", "is", null);
        if (stageErr) return json({ error: stageErr.message }, 500);

        // 3. Compute the worst overdue days per case.
        const overdueByCase = new Map<
          string,
          { days: number; stageName: string }
        >();
        for (const s of stages ?? []) {
          const deadline = new Date(s.deadline as string);
          deadline.setHours(0, 0, 0, 0);
          const days = Math.floor(
            (today.getTime() - deadline.getTime()) / 86_400_000,
          );
          if (days <= 0) continue;
          const existing = overdueByCase.get(s.case_id as string);
          if (!existing || days > existing.days) {
            overdueByCase.set(s.case_id as string, {
              days,
              stageName: (s.name as string) ?? "stage",
            });
          }
        }

        // 4. Super Admin recipients for escalation alerts.
        const { data: admins } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("role", "super_admin")
          .eq("is_active", true);
        const adminIds = (admins ?? []).map((a) => a.id);

        let updated = 0;
        let escalated = 0;
        const notifications: {
          user_id: string;
          type: string;
          title: string;
          body: string;
          link: string;
        }[] = [];

        for (const c of caseMap.values()) {
          const overdue = overdueByCase.get(c.id);
          const newHealth = !overdue
            ? "on_track"
            : overdue.days >= 3
              ? "overdue"
              : "at_risk";

          if (newHealth === c.health) continue;

          const { error: upErr } = await supabaseAdmin
            .from("cases")
            .update({ health: newHealth })
            .eq("id", c.id);
          if (upErr) continue;
          updated++;

          // Only escalate when a case becomes at_risk / overdue.
          if (overdue) {
            for (const adminId of adminIds) {
              notifications.push({
                user_id: adminId,
                type: "stage_escalation",
                title:
                  newHealth === "overdue"
                    ? `Overdue: ${c.case_ref ?? c.title}`
                    : `At risk: ${c.case_ref ?? c.title}`,
                body: `Stage "${overdue.stageName}" is ${overdue.days} day${
                  overdue.days === 1 ? "" : "s"
                } past its deadline on ${c.title}.`,
                link: `/cases/${c.id}`,
              });
            }
          }
        }

        if (notifications.length > 0) {
          const { error: notifErr } = await supabaseAdmin
            .from("notifications")
            .insert(notifications);
          if (!notifErr) escalated = notifications.length;
        }

        return json({
          processed: caseMap.size,
          overdue: overdueByCase.size,
          updated,
          escalated,
        });
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
