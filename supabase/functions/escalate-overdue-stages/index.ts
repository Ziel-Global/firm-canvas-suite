import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Workflow escalation scan.
 *
 * Finds open cases with overdue active stages, updates case health, and alerts
 * every Super Admin by in-app notification AND email via send-email.
 */
serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: openCases, error: caseErr } = await supabase
      .from("cases")
      .select("id, case_ref, title, health")
      .neq("status", "closed");
    if (caseErr) throw caseErr;

    const caseMap = new Map((openCases ?? []).map((c) => [c.id, c]));
    const openIds = [...caseMap.keys()];

    if (openIds.length === 0) {
      return json({ processed: 0, updated: 0, escalated: 0, emailed: 0 });
    }

    const { data: stages, error: stageErr } = await supabase
      .from("case_stages")
      .select("id, case_id, name, deadline, assignee_id")
      .eq("status", "active")
      .in("case_id", openIds)
      .not("deadline", "is", null);
    if (stageErr) throw stageErr;

    const overdueByCase = new Map<
      string,
      { days: number; stageName: string; assigneeId: string | null }
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
          assigneeId: (s.assignee_id as string | null) ?? null,
        });
      }
    }

    const { data: admins } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "super_admin")
      .eq("is_active", true);

    const adminRows = admins ?? [];

    // Resolve emails for Super Admins once.
    const adminEmails = new Map<string, string>();
    for (const admin of adminRows) {
      const { data: authUser } = await supabase.auth.admin.getUserById(admin.id);
      if (authUser?.user?.email) {
        adminEmails.set(admin.id, authUser.user.email);
      }
    }

    let updated = 0;
    let escalated = 0;
    let emailed = 0;
    const emailErrors: string[] = [];

    for (const c of caseMap.values()) {
      const overdue = overdueByCase.get(c.id);
      const newHealth = !overdue
        ? "on_track"
        : overdue.days >= 3
          ? "overdue"
          : "at_risk";

      if (newHealth === c.health) continue;

      const { error: upErr } = await supabase
        .from("cases")
        .update({ health: newHealth })
        .eq("id", c.id);
      if (upErr) continue;
      updated++;

      await supabase.from("activity_log").insert({
        case_id: c.id,
        actor_id: null,
        action: "case_health_updated",
        detail: {
          old_health: c.health,
          new_health: newHealth,
          stage_name: overdue?.stageName ?? null,
          days_overdue: overdue?.days ?? null,
        },
      });

      // Alert Super Admins when a case becomes at_risk / overdue.
      if (!overdue) continue;

      const title =
        newHealth === "overdue"
          ? `Overdue: ${c.case_ref ?? c.title}`
          : `At risk: ${c.case_ref ?? c.title}`;
      const body =
        `Stage "${overdue.stageName}" is ${overdue.days} day${
          overdue.days === 1 ? "" : "s"
        } past its deadline on ${c.title}.`;
      const link = `/cases/${c.id}`;

      for (const admin of adminRows) {
        const { error: notifErr } = await supabase.from("notifications").insert({
          user_id: admin.id,
          type: "stage_escalation",
          title,
          body,
          link,
        });
        if (!notifErr) escalated++;

        const email = adminEmails.get(admin.id);
        if (!email) continue;

        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: email,
              subject: title,
              html: `<p>Hi ${admin.full_name || "Principal"},</p>
<p><strong>${title}</strong></p>
<p>${body}</p>
<p><a href="https://firmcanvas.app${link}">Open matter</a></p>
<p style="color:#666;font-size:12px;">This is an automated escalation from Firm Operations Portal.</p>`,
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              (data as { error?: string }).error || `send-email ${res.status}`,
            );
          }
          emailed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          emailErrors.push(`${admin.id}: ${message}`);
        }
      }
    }

    return json({
      message: "Escalation scan complete",
      processed: caseMap.size,
      overdue: overdueByCase.size,
      updated,
      escalated,
      emailed,
      emailErrors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("escalate-overdue-stages failed:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
