import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  case_id: string | null;
  client_id: string | null;
  cases: { title: string | null; case_ref: string | null } | null;
  clients: { email: string | null; full_name: string | null } | null;
}

interface DueReminderRow {
  id: string;
  offset_days: number;
  channel: string;
  invoices: InvoiceRow;
}

function isDue(dueDateStr: string, offsetDays: number, now: Date): boolean {
  const dueDate = new Date(`${dueDateStr}T00:00:00Z`);
  const reminderAt = new Date(dueDate.getTime() + offsetDays * 86_400_000);
  return now >= reminderAt;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function invokeFunction(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
  body: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to invoke ${name} (${res.status})`,
    );
  }
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();

    const { data: reminders, error } = await supabase
      .from("invoice_reminders")
      .select(
        `
        id,
        offset_days,
        channel,
        invoices (
          id,
          invoice_number,
          status,
          due_date,
          total,
          amount_paid,
          case_id,
          client_id,
          cases (title, case_ref),
          clients (email, full_name)
        )
      `,
      )
      .eq("sent", false);

    if (error) throw error;

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const errors: { reminderId: string; error: string }[] = [];

    for (const row of (reminders ?? []) as unknown as DueReminderRow[]) {
      const invoice = row.invoices;
      if (!invoice?.due_date) {
        skipped++;
        continue;
      }

      // Already settled or retracted — nothing to chase.
      if (invoice.status === "paid" || invoice.status === "void") {
        await supabase.from("invoice_reminders").update({ sent: true }).eq("id", row.id);
        skipped++;
        continue;
      }

      if (!isDue(invoice.due_date, row.offset_days, now)) {
        continue;
      }

      processed++;

      const { data: claimed, error: claimErr } = await supabase
        .from("invoice_reminders")
        .update({ sent: true, sent_at: now.toISOString() })
        .eq("id", row.id)
        .eq("sent", false)
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed) continue;

      const balanceDue = invoice.total - invoice.amount_paid;
      const caseLabel = invoice.cases
        ? [invoice.cases.case_ref, invoice.cases.title].filter(Boolean).join(" · ")
        : null;

      const title = `Payment reminder: invoice ${invoice.invoice_number}`;
      const body = `Invoice ${invoice.invoice_number}${
        caseLabel ? ` (${caseLabel})` : ""
      } has a balance of ${money(balanceDue)} that is now ${row.offset_days} day${
        row.offset_days === 1 ? "" : "s"
      } past due.`;

      try {
        const email = invoice.clients?.email;
        if (!email) throw new Error("Client has no email on file");

        await invokeFunction(supabaseUrl, supabaseServiceKey, "send-email", {
          to: email,
          subject: title,
          html: `<p>Hi ${invoice.clients?.full_name || "there"},</p><p>${body}</p><p><a href="https://firmcanvas.app/portal/invoices/${invoice.id}">View invoice</a></p>`,
        });

        sent++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push({ reminderId: row.id, error: message });

        await supabase
          .from("invoice_reminders")
          .update({ sent: false, sent_at: null })
          .eq("id", row.id);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Invoice reminder processing complete",
        checked: reminders?.length ?? 0,
        processed,
        sent,
        skipped,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("process-invoice-reminders failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
