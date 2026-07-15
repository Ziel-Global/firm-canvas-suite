/**
 * Verify overdue-stage escalation creates in-app + email alerts for Super Admins.
 *
 * Usage: node --env-file=.env test-escalate-overdue.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const { data: admin, error: adminErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "super_admin")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (adminErr || !admin) throw new Error("No super_admin found");

  const marker = `Escalation verify ${new Date().toISOString()}`;
  const past = new Date();
  past.setDate(past.getDate() - 4);
  const deadline = past.toISOString().slice(0, 10);

  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .insert({
      title: marker,
      case_ref: `ESC-${Date.now().toString().slice(-6)}`,
      status: "active",
      health: "on_track",
    })
    .select("id, case_ref, title")
    .single();
  if (caseErr) throw caseErr;

  const { data: stage, error: stageErr } = await supabase
    .from("case_stages")
    .insert({
      case_id: caseRow.id,
      name: "Principal Approval",
      status: "active",
      deadline,
      sequence_order: 1,
      assignee_id: admin.id,
    })
    .select("id")
    .single();
  if (stageErr) throw stageErr;

  console.log("Created overdue case:", caseRow.id, "stage:", stage.id);
  console.log("Deadline:", deadline, "(4 days ago) — expect health=overdue");

  const before = new Date().toISOString();

  const res = await fetch(`${url}/functions/v1/escalate-overdue-stages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const result = await res.json();
  console.log("Escalation response:", JSON.stringify(result, null, 2));

  const { data: updatedCase } = await supabase
    .from("cases")
    .select("health")
    .eq("id", caseRow.id)
    .single();
  console.log("Case health after scan:", updatedCase?.health);

  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, type, title, body, created_at")
    .eq("user_id", admin.id)
    .eq("type", "stage_escalation")
    .gte("created_at", before)
    .order("created_at", { ascending: false });

  console.log("In-app notifications:", notifs?.length ?? 0, notifs?.[0] ?? null);

  const emailed = (result.emailed ?? 0) > 0;
  const inApp = (notifs?.length ?? 0) > 0;
  const healthOk = updatedCase?.health === "overdue";

  if (healthOk && inApp && emailed) {
    console.log("PASS: overdue stage produced in-app + email alerts");
  } else {
    console.error("FAIL", { healthOk, inApp, emailed, emailErrors: result.emailErrors });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
