import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Scheduled edge function (e.g. daily via pg_cron/pg_net) that identifies 
 * active cases with slipping deadlines, updates case health, and alerts Super Admins.
 */
serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables.");
    }

    // Bypass RLS to scan all cases and update health
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get all active cases with their incomplete tasks and active stages
    const { data: cases, error: caseErr } = await supabase
      .from("cases")
      .select(`
        id,
        title,
        health,
        tasks (
          id,
          title,
          due_date,
          status
        ),
        case_stages (
          name,
          status,
          target_date,
          profiles (
            full_name
          )
        )
      `)
      .eq("status", "active");

    if (caseErr) throw caseErr;

    // 2. Get super admins to notify
    const { data: superAdmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .eq("is_active", true);

    const superAdminIds = (superAdmins || []).map(a => a.id);
    const notifications: any[] = [];
    const updates: any[] = [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Check next 3 days for "at_risk"
    const atRiskThreshold = new Date(today);
    atRiskThreshold.setDate(atRiskThreshold.getDate() + 3);

    for (const c of cases || []) {
      const openTasks = (c.tasks || []).filter(t => t.status !== "done" && t.due_date);
      const activeStages = (c.case_stages || []).filter(s => s.status === "active");
      
      let isOverdue = false;
      let isAtRisk = false;
      let reason = "";

      // Check tasks
      for (const t of openTasks) {
        const dueDate = new Date(t.due_date);
        if (dueDate < today) {
          isOverdue = true;
          reason = `Task "${t.title}" is overdue (${dueDate.toLocaleDateString()}).`;
          break;
        } else if (dueDate <= atRiskThreshold) {
          isAtRisk = true;
          reason = `Task "${t.title}" is due soon (${dueDate.toLocaleDateString()}).`;
        }
      }

      // Check stages if not already overdue
      if (!isOverdue) {
        for (const s of activeStages) {
          if (s.target_date) {
            const targetDate = new Date(s.target_date);
            if (targetDate < today) {
              isOverdue = true;
              reason = `Stage "${s.name}" is overdue (${targetDate.toLocaleDateString()}).`;
              break;
            } else if (targetDate <= atRiskThreshold) {
              isAtRisk = true;
              reason = `Stage "${s.name}" target is approaching (${targetDate.toLocaleDateString()}).`;
            }
          }
        }
      }

      let newHealth = "on_track";
      if (isOverdue) newHealth = "overdue";
      else if (isAtRisk) newHealth = "at_risk";

      // If health worsened, record update and queue notifications
      if (newHealth !== "on_track" && c.health !== newHealth) {
        updates.push({ id: c.id, health: newHealth });
        
        const currentStage = activeStages[0];
        const responsibleMember = (currentStage?.profiles as any)?.full_name || "Unassigned";

        for (const adminId of superAdminIds) {
          notifications.push({
            user_id: adminId,
            type: "risk_alert",
            title: `Case Risk: ${c.title}`,
            body: `${reason} Stage: ${currentStage?.name || 'None'}. Responsible: ${responsibleMember}. Health updated to ${newHealth}.`,
            link: `/cases/${c.id}`
          });
        }
      }
    }

    // 3. Apply updates
    if (updates.length > 0) {
      for (const u of updates) {
        await supabase.from("cases").update({ health: u.health }).eq("id", u.id);
      }
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({ 
        message: "Risk scan complete", 
        casesScanned: cases?.length || 0,
        casesUpdated: updates.length 
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Risk scan failed:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" } 
    });
  }
});
