/**
 * Verify morning digest delivery.
 *
 * 1. Sets morning_digest_time to the current firm-local minute
 * 2. Clears last-sent so the window is open
 * 3. Invokes send-morning-digest (non-force) to prove time gating + email
 *
 * Usage: node --env-file=.env test-morning-digest.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tz = process.env.FIRM_TIMEZONE || "Asia/Karachi";

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

function firmNowParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

async function main() {
  const { date, hhmm } = firmNowParts();
  console.log(`Firm time (${tz}): ${date} ${hhmm}`);

  await supabase.from("firm_settings").upsert(
    [
      { key: "morning_digest_time", value: JSON.stringify(hhmm) },
      { key: "morning_digest_last_sent", value: JSON.stringify("") },
    ],
    { onConflict: "key" },
  );
  console.log("Configured morning_digest_time ->", hhmm);

  // Outside window should no-op if we set a different time first
  await supabase
    .from("firm_settings")
    .upsert({ key: "morning_digest_time", value: JSON.stringify("00:01") }, { onConflict: "key" });

  let res = await fetch(`${url}/functions/v1/send-morning-digest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  let outside = await res.json();
  console.log("Outside window:", outside);
  if (outside.sent !== false || outside.reason !== "outside_digest_window") {
    console.error("FAIL: expected outside_digest_window");
    process.exit(1);
  }

  // Match configured time and send
  await supabase.from("firm_settings").upsert(
    [
      { key: "morning_digest_time", value: JSON.stringify(hhmm) },
      { key: "morning_digest_last_sent", value: JSON.stringify("") },
    ],
    { onConflict: "key" },
  );

  res = await fetch(`${url}/functions/v1/send-morning-digest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const sent = await res.json();
  console.log("At configured time:", JSON.stringify(sent, null, 2));

  if (!sent.sent || (sent.emailed ?? 0) < 1) {
    console.error("FAIL: digest did not email at configured time", sent.errors);
    process.exit(1);
  }

  // Idempotent: second call should skip
  res = await fetch(`${url}/functions/v1/send-morning-digest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const again = await res.json();
  console.log("Second call (same minute):", again);
  if (again.reason !== "already_sent_today") {
    console.error("FAIL: expected already_sent_today");
    process.exit(1);
  }

  // Restore default time
  await supabase
    .from("firm_settings")
    .upsert({ key: "morning_digest_time", value: JSON.stringify("07:30") }, { onConflict: "key" });

  console.log("PASS: digest arrives at configured morning_digest_time");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
