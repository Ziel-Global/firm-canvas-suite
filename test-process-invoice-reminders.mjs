/**
 * Verify process-invoice-reminders: create an overdue invoice with a reminder
 * due right now, run the scheduler, confirm the reminder row is marked sent.
 *
 * Usage: node test-process-invoice-reminders.mjs
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
  const stamp = new Date().toISOString();

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      full_name: `Reminder Test Client ${stamp}`,
      email: "reminder-test@example.com",
    })
    .select("id")
    .single();
  if (clientErr) throw clientErr;

  const { data: kase, error: caseErr } = await supabase
    .from("cases")
    .insert({
      title: `Reminder test matter ${stamp}`,
      client_id: client.id,
      case_type: "other",
      status: "active",
      fee_structure: "hourly",
    })
    .select("id")
    .single();
  if (caseErr) throw caseErr;

  const dueDate = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10); // 5 days ago

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .insert({
      case_id: kase.id,
      client_id: client.id,
      invoice_number: `TEST-${Date.now()}`,
      status: "sent",
      fee_structure_snapshot: "hourly",
      issue_date: dueDate,
      due_date: dueDate,
      subtotal: 500,
      total: 500,
    })
    .select("id")
    .single();
  if (invoiceErr) throw invoiceErr;

  const { data: reminder, error: remErr } = await supabase
    .from("invoice_reminders")
    .insert({
      invoice_id: invoice.id,
      offset_days: 3, // due date + 3 days is already in the past given a 5-day-old due date
      channel: "email",
      sent: false,
    })
    .select("id, sent")
    .single();
  if (remErr) throw remErr;

  console.log("Created test client:", client.id);
  console.log("Created test matter:", kase.id);
  console.log("Created overdue invoice:", invoice.id, "due", dueDate);
  console.log("Created due reminder:", reminder.id, "(offset 3 days)");

  const res = await fetch(`${url}/functions/v1/process-invoice-reminders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const result = await res.json();
  console.log("Scheduler response:", JSON.stringify(result, null, 2));

  const { data: after, error: afterErr } = await supabase
    .from("invoice_reminders")
    .select("id, sent")
    .eq("id", reminder.id)
    .single();
  if (afterErr) throw afterErr;

  console.log("Reminder after run:", after);

  if (!after.sent) {
    console.error("FAIL: reminder was not marked sent");
    process.exit(1);
  }

  console.log("PASS: due invoice reminder fired and marked sent");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
