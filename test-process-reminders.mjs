/**
 * Verify process-reminders: create an event whose 2-hour reminder is due now,
 * run the scheduler, confirm the reminder row is marked sent.
 *
 * Usage: node test-process-reminders.mjs
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
  const { data: owner, error: ownerErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (ownerErr || !owner) throw new Error("No active profile found for test owner");

  const startsAt = new Date(Date.now() + 120 * 60_000).toISOString();
  const title = `Reminder test ${new Date().toISOString()}`;

  const { data: event, error: eventErr } = await supabase
    .from("calendar_events")
    .insert({
      title,
      event_type: "meeting",
      starts_at: startsAt,
      ends_at: new Date(Date.now() + 180 * 60_000).toISOString(),
      owner_id: owner.id,
      is_private: false,
    })
    .select("id")
    .single();

  if (eventErr) throw eventErr;

  const { data: reminder, error: remErr } = await supabase
    .from("event_reminders")
    .insert({
      event_id: event.id,
      offset_minutes: 120,
      channel: "in_app",
      sent: false,
    })
    .select("id, sent")
    .single();

  if (remErr) throw remErr;

  console.log("Created test event:", event.id);
  console.log("Created due reminder:", reminder.id, "(2 hours before, in_app)");

  const res = await fetch(`${url}/functions/v1/process-reminders`, {
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
    .from("event_reminders")
    .select("id, sent")
    .eq("id", reminder.id)
    .single();

  if (afterErr) throw afterErr;

  console.log("Reminder after run:", after);

  if (!after.sent) {
    console.error("FAIL: reminder was not marked sent");
    process.exit(1);
  }

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", owner.id)
    .eq("type", "event_reminder")
    .ilike("title", `%${title}%`);

  console.log("Matching in-app notifications:", count ?? 0);
  console.log("PASS: due reminder fired and marked sent");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
