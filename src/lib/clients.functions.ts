import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ClientRow {
  id: string;
  client_ref: string;
  full_name: string;
  active_case_count: number;
  last_contact_at: string | null;
  next_hearing_at: string | null;
  created_at: string;
}

/**
 * List clients visible to the caller. RLS on `clients`, `cases`, and
 * `calendar_events` enforces who sees what:
 * - super_admin / admin: all clients
 * - senior / junior lawyer: only clients tied to their assigned cases
 * The aggregated case/hearing data is computed from RLS-filtered rows, so a
 * lawyer never learns about cases they cannot access.
 */
export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientRow[]> => {
    const { supabase } = context;

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, client_ref, full_name, created_at");
    if (clientsError) throw new Error(clientsError.message);
    if (!clients || clients.length === 0) return [];

    const clientIds = clients.map((c) => c.id);

    const { data: cases, error: casesError } = await supabase
      .from("cases")
      .select("id, client_id, status")
      .in("client_id", clientIds);
    if (casesError) throw new Error(casesError.message);

    const caseRows = cases ?? [];
    const caseIds = caseRows.map((c) => c.id);
    const caseToClient = new Map<string, string>();
    for (const c of caseRows) caseToClient.set(c.id, c.client_id as string);

    let events: { case_id: string; event_type: string; starts_at: string }[] = [];
    if (caseIds.length > 0) {
      const { data: ev, error: evError } = await supabase
        .from("calendar_events")
        .select("case_id, event_type, starts_at")
        .in("case_id", caseIds);
      if (evError) throw new Error(evError.message);
      events = (ev ?? []) as typeof events;
    }

    const now = Date.now();
    const activeCount = new Map<string, number>();
    const lastContact = new Map<string, string>();
    const nextHearing = new Map<string, string>();

    for (const c of caseRows) {
      if (c.status !== "closed") {
        activeCount.set(c.client_id as string, (activeCount.get(c.client_id as string) ?? 0) + 1);
      }
    }

    for (const e of events) {
      const clientId = caseToClient.get(e.case_id);
      if (!clientId) continue;
      const ts = new Date(e.starts_at).getTime();
      if (ts <= now) {
        const prev = lastContact.get(clientId);
        if (!prev || ts > new Date(prev).getTime()) lastContact.set(clientId, e.starts_at);
      }
      if (e.event_type === "hearing" && ts >= now) {
        const prev = nextHearing.get(clientId);
        if (!prev || ts < new Date(prev).getTime()) nextHearing.set(clientId, e.starts_at);
      }
    }

    return clients.map((c) => ({
      id: c.id,
      client_ref: c.client_ref as string,
      full_name: c.full_name as string,
      active_case_count: activeCount.get(c.id) ?? 0,
      last_contact_at: lastContact.get(c.id) ?? null,
      next_hearing_at: nextHearing.get(c.id) ?? null,
      created_at: c.created_at as string,
    }));
  });
