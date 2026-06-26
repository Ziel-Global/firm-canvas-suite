import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DashboardCase {
  id: string;
  case_ref: string | null;
  title: string;
  health: string | null;
}

export interface DashboardData {
  counts: { on_track: number; at_risk: number; overdue: number; total: number };
  attention: DashboardCase[];
}

/**
 * Health overview for the dashboard. RLS scopes the rows to cases the current
 * user is allowed to see, so the figures match the case list automatically.
 */
export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("cases")
      .select("id, case_ref, title, health")
      .neq("status", "closed");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const counts = {
      on_track: 0,
      at_risk: 0,
      overdue: 0,
      total: rows.length,
    };
    for (const r of rows) {
      if (r.health === "overdue") counts.overdue++;
      else if (r.health === "at_risk") counts.at_risk++;
      else counts.on_track++;
    }

    const rank: Record<string, number> = { overdue: 0, at_risk: 1 };
    const attention = rows
      .filter((r) => r.health === "overdue" || r.health === "at_risk")
      .sort((a, b) => (rank[a.health ?? ""] ?? 9) - (rank[b.health ?? ""] ?? 9))
      .map((r) => ({
        id: r.id,
        case_ref: r.case_ref,
        title: r.title,
        health: r.health,
      }));

    return { counts, attention };
  });
