import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ELEVATED_ROLES = ["super_admin", "admin", "senior_lawyer"];

/**
 * Complete the active stage of a case: optionally save notes, mark it complete,
 * activate the next stage, update cases.current_stage_id, notify the next
 * assignee, and log both transitions to activity_log.
 */
export const completeStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; stageId: string; notes?: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.stageId) throw new Error("A stage id is required.");
    return {
      caseId: input.caseId,
      stageId: input.stageId,
      notes: input.notes ?? undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: role } = await supabase.rpc("current_role");
    const elevated = ELEVATED_ROLES.includes((role as string) ?? "");

    const { data: stage, error: stageErr } = await supabase
      .from("case_stages")
      .select("id, case_id, name, sequence_order, status, assignee_id")
      .eq("id", data.stageId)
      .single();
    if (stageErr || !stage) throw new Error("Stage not found.");
    if (stage.case_id !== data.caseId) throw new Error("Stage does not belong to this matter.");
    if (stage.status === "complete") throw new Error("This stage is already complete.");
    if (!elevated && stage.assignee_id !== userId)
      throw new Error("Only the stage assignee can complete this stage.");

    // Principal Approval gate: this stage cannot be passed without the
    // Super Admin's explicit sign-off. No output advances past it otherwise.
    const isPrincipalApproval = /principal\s+approval/i.test(stage.name ?? "");
    if (isPrincipalApproval && (role as string) !== "super_admin")
      throw new Error(
        "The Principal Approval stage requires the Super Admin's explicit sign-off and cannot be completed by anyone else.",
      );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Complete the current stage (and save notes if provided).
    const completeUpdate: {
      status: "complete";
      completed_at: string;
      notes?: string;
    } = {
      status: "complete",
      completed_at: new Date().toISOString(),
    };
    if (data.notes !== undefined) completeUpdate.notes = data.notes;
    const { error: upErr } = await supabaseAdmin
      .from("case_stages")
      .update(completeUpdate)
      .eq("id", stage.id);
    if (upErr) throw new Error(upErr.message);

    const {
      markStageTaskComplete,
      activateStageTask,
    } = await import("@/lib/stage-task-sync");
    await markStageTaskComplete(supabaseAdmin, stage.id);

    // Find the next stage by sequence order.
    const { data: nextStage } = await supabaseAdmin
      .from("case_stages")
      .select("id, name, assignee_id, sequence_order")
      .eq("case_id", data.caseId)
      .gt("sequence_order", stage.sequence_order ?? 0)
      .order("sequence_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextStage) {
      await supabaseAdmin
        .from("case_stages")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("id", nextStage.id);
      await supabaseAdmin
        .from("cases")
        .update({ current_stage_id: nextStage.id })
        .eq("id", data.caseId);

      await activateStageTask(supabaseAdmin, nextStage.id);

      if (nextStage.assignee_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: nextStage.assignee_id,
          type: "stage_assigned",
          title: "A stage is ready for you",
          body: `"${nextStage.name ?? "A stage"}" is now active and assigned to you.`,
          link: `/cases/${data.caseId}`,
        });

        // Send email
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(nextStage.assignee_id);
        const { data: assigneeProf } = await supabaseAdmin.from("profiles").select("full_name").eq("id", nextStage.assignee_id).single();
          
        if (authUser?.user?.email) {
          const { data: cData } = await supabaseAdmin.from("cases").select("title").eq("id", data.caseId).single();
          const cTitle = cData?.title ?? "Unknown Matter";

          supabaseAdmin.functions.invoke("send-email", {
            body: {
              to: authUser.user.email,
              subject: `Stage Ready: ${nextStage.name}`,
              html: `<p>Hi ${(assigneeProf as any)?.full_name || 'Team Member'},</p><p>The stage <strong>${nextStage.name}</strong> on matter <strong>${cTitle}</strong> is now active and assigned to you.</p><p><a href="https://firmcanvas.app/cases/${data.caseId}">View Matter</a></p>`
            }
          }).catch(err => console.error("Failed to send stage email:", err));
        }
      }
    } else {
      // No further stages — clear the current stage pointer.
      await supabaseAdmin.from("cases").update({ current_stage_id: null }).eq("id", data.caseId);
    }

    await supabaseAdmin.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: "stage_completed",
      detail: {
        stage_id: stage.id,
        stage_name: stage.name,
        next_stage_id: nextStage?.id ?? null,
        next_stage_name: nextStage?.name ?? null,
        notes: data.notes ?? null,
      },
    });

    return { ok: true, nextStageId: nextStage?.id ?? null };
  });

/**
 * Return the active stage to the previous stage's assignee with comments.
 * Marks the current stage returned, reactivates the previous stage, updates
 * cases.current_stage_id, notifies the previous assignee, and logs it.
 */
export const returnStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string; stageId: string; comments: string }) => {
    if (!input?.caseId) throw new Error("A matter id is required.");
    if (!input?.stageId) throw new Error("A stage id is required.");
    if (!input?.comments?.trim())
      throw new Error("Please add comments explaining why you are returning.");
    return {
      caseId: input.caseId,
      stageId: input.stageId,
      comments: input.comments.trim(),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: role } = await supabase.rpc("current_role");
    const elevated = ELEVATED_ROLES.includes((role as string) ?? "");

    const { data: stage, error: stageErr } = await supabase
      .from("case_stages")
      .select("id, case_id, name, sequence_order, status, assignee_id")
      .eq("id", data.stageId)
      .single();
    if (stageErr || !stage) throw new Error("Stage not found.");
    if (stage.case_id !== data.caseId) throw new Error("Stage does not belong to this matter.");
    if (!elevated && stage.assignee_id !== userId)
      throw new Error("Only the stage assignee can return this stage.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prevStage } = await supabaseAdmin
      .from("case_stages")
      .select("id, name, assignee_id, sequence_order")
      .eq("case_id", data.caseId)
      .lt("sequence_order", stage.sequence_order ?? 0)
      .order("sequence_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prevStage) throw new Error("There is no previous stage to return to.");

    await supabaseAdmin.from("case_stages").update({ status: "returned" }).eq("id", stage.id);

    await supabaseAdmin
      .from("case_stages")
      .update({ status: "active", completed_at: null })
      .eq("id", prevStage.id);

    await supabaseAdmin
      .from("cases")
      .update({ current_stage_id: prevStage.id })
      .eq("id", data.caseId);

    const { reactivateStageTask } = await import("@/lib/stage-task-sync");
    await reactivateStageTask(supabaseAdmin, prevStage.id);

    if (prevStage.assignee_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: prevStage.assignee_id,
        type: "stage_returned",
        title: "A stage was returned to you",
        body: `"${stage.name ?? "A stage"}" was returned. Comments: ${data.comments}`,
        link: `/cases/${data.caseId}`,
      });
    }

    await supabaseAdmin.from("activity_log").insert({
      case_id: data.caseId,
      actor_id: userId,
      action: "stage_returned",
      detail: {
        stage_id: stage.id,
        stage_name: stage.name,
        returned_to_stage_id: prevStage.id,
        returned_to_stage_name: prevStage.name,
        comments: data.comments,
      },
    });

    return { ok: true, previousStageId: prevStage.id };
  });
