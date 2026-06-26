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

export interface CreateClientInput {
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

/**
 * Create a new client. Auto-generates a unique, sequential client_ref in the
 * format CL-YYYY-NNNN via the `next_client_ref` DB function (advisory-locked to
 * avoid race conditions) and writes the creation to activity_log.
 */
export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateClientInput) => {
    const full_name = (input.full_name ?? "").trim();
    if (!full_name) throw new Error("Full name is required.");
    return {
      full_name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string; client_ref: string }> => {
    const { supabase, userId } = context;

    const { data: refData, error: refError } = await supabase.rpc("next_client_ref");
    if (refError) throw new Error(refError.message);
    const client_ref = refData as string;

    const { data: inserted, error: insertError } = await supabase
      .from("clients")
      .insert({
        client_ref,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        notes: data.notes,
        created_by: userId,
      })
      .select("id, client_ref")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error: logError } = await supabase.from("activity_log").insert({
      actor_id: userId,
      action: "client_created",
      detail: { client_id: inserted.id, client_ref: inserted.client_ref, full_name: data.full_name },
    });
    if (logError) throw new Error(logError.message);

    return { id: inserted.id, client_ref: inserted.client_ref ?? client_ref };
  });

export interface ClientCaseRow {
  id: string;
  case_ref: string | null;
  title: string;
  status: string;
  health: string | null;
  current_stage_name: string | null;
}

export interface ActivityEntry {
  id: string;
  case_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface ClientDetail {
  id: string;
  client_ref: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  cases: ClientCaseRow[];
  history: ActivityEntry[];
}

export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Client id is required.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<ClientDetail> => {
    const { supabase } = context;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, client_ref, full_name, email, phone, address, notes, created_at")
      .eq("id", data.id)
      .single();
    if (clientError) throw new Error(clientError.message);

    // Linked cases (RLS-filtered) with current stage name
    const { data: cases, error: casesError } = await supabase
      .from("cases")
      .select("id, case_ref, title, status, health, current_stage_id")
      .eq("client_id", data.id)
      .order("created_at", { ascending: false });
    if (casesError) throw new Error(casesError.message);

    const caseRows = cases ?? [];
    const caseIds = caseRows.map((c) => c.id);

    const stageIds = caseRows
      .map((c) => c.current_stage_id)
      .filter((s): s is string => Boolean(s));
    const stageNames = new Map<string, string>();
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from("case_stages")
        .select("id, name")
        .in("id", stageIds);
      for (const s of stages ?? []) stageNames.set(s.id, s.name as string);
    }

    const clientCases: ClientCaseRow[] = caseRows.map((c) => ({
      id: c.id,
      case_ref: c.case_ref as string | null,
      title: c.title as string,
      status: c.status as string,
      health: c.health as string | null,
      current_stage_name: c.current_stage_id ? stageNames.get(c.current_stage_id) ?? null : null,
    }));

    // Contact history: activity tied to this client's cases, plus client-level
    // events (case_id null, detail.client_id == this client).
    const historyMap = new Map<string, ActivityEntry>();

    if (caseIds.length > 0) {
      const { data: caseActivity } = await supabase
        .from("activity_log")
        .select("id, case_id, actor_id, action, detail, created_at")
        .in("case_id", caseIds)
        .order("created_at", { ascending: false })
        .limit(200);
      for (const a of caseActivity ?? []) historyMap.set(a.id, a as ActivityEntry);
    }

    const { data: clientActivity } = await supabase
      .from("activity_log")
      .select("id, case_id, actor_id, action, detail, created_at")
      .filter("detail->>client_id", "eq", data.id)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const a of clientActivity ?? []) historyMap.set(a.id, a as ActivityEntry);

    const history = Array.from(historyMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    // Resolve actor names
    const actorIds = Array.from(
      new Set(history.map((h) => h.actor_id).filter((a): a is string => Boolean(a))),
    );
    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of profiles ?? []) actorNames.set(p.id, p.full_name as string);
    }

    return {
      id: client.id,
      client_ref: client.client_ref as string | null,
      full_name: client.full_name as string,
      email: client.email as string | null,
      phone: client.phone as string | null,
      address: client.address as string | null,
      notes: client.notes as string | null,
      created_at: client.created_at as string,
      cases: clientCases,
      history: history.map((h) => ({
        ...h,
        actor_name: h.actor_id ? actorNames.get(h.actor_id) ?? null : null,
      })),
    };
  });

export interface UpdateClientInput {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateClientInput) => {
    if (!input?.id) throw new Error("Client id is required.");
    const full_name = (input.full_name ?? "").trim();
    if (!full_name) throw new Error("Full name is required.");
    return {
      id: input.id,
      full_name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    const { data: before, error: beforeError } = await supabase
      .from("clients")
      .select("full_name, email, phone, address, notes")
      .eq("id", data.id)
      .single();
    if (beforeError) throw new Error(beforeError.message);

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        notes: data.notes,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    const fields = ["full_name", "email", "phone", "address", "notes"] as const;
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) {
      if ((before as Record<string, unknown>)[f] !== (data as Record<string, unknown>)[f]) {
        changed[f] = { from: (before as Record<string, unknown>)[f], to: (data as Record<string, unknown>)[f] };
      }
    }

    const { error: logError } = await supabase.from("activity_log").insert({
      actor_id: userId,
      action: "client_updated",
      detail: { client_id: data.id, changed },
    });
    if (logError) throw new Error(logError.message);

    return { id: data.id };
  });
