/**
 * Keep a Tasks-board row in sync with a case stage assignee.
 * tasks.stage_id links them 1:1 (unique partial index).
 */

type AdminClient = {
  from: (table: string) => any;
};

function taskStatusForStage(
  stageStatus: string | null | undefined,
): "todo" | "in_progress" | "done" {
  if (stageStatus === "complete") return "done";
  if (stageStatus === "active") return "in_progress";
  return "todo";
}

function stageTaskTitle(stageName: string | null | undefined) {
  const name = (stageName ?? "").trim() || "Untitled";
  return `Stage: ${name}`;
}

/**
 * Create or update the task for a stage assignee. Clears/deletes the task
 * when the stage is unassigned.
 */
export async function syncStageAssigneeTask(
  supabaseAdmin: AdminClient,
  opts: {
    stageId: string;
    caseId: string;
    stageName: string | null;
    stageStatus: string | null;
    deadline: string | null;
    assigneeId: string | null;
    actorId: string;
  },
) {
  const { data: existing } = await supabaseAdmin
    .from("tasks")
    .select("id")
    .eq("stage_id", opts.stageId)
    .maybeSingle();

  if (!opts.assigneeId) {
    if (existing?.id) {
      await supabaseAdmin.from("tasks").delete().eq("id", existing.id);
    }
    return;
  }

  const status = taskStatusForStage(opts.stageStatus);
  const payload = {
    title: stageTaskTitle(opts.stageName),
    description:
      "Workflow stage on this matter. Complete it from the case Stages tab.",
    case_id: opts.caseId,
    assignee_id: opts.assigneeId,
    status,
    priority: "medium" as const,
    due_date: opts.deadline,
    stage_id: opts.stageId,
    completed_at: status === "done" ? new Date().toISOString() : null,
  };

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("tasks")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabaseAdmin.from("tasks").insert({
    ...payload,
    created_by: opts.actorId,
  });
  if (error) throw new Error(error.message);
}

/** Mark the stage-linked task done (when the stage is completed). */
export async function markStageTaskComplete(
  supabaseAdmin: AdminClient,
  stageId: string,
) {
  const { error } = await supabaseAdmin
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("stage_id", stageId);
  if (error) throw new Error(error.message);
}

/** Put a stage-linked task back into progress (return / reactivate). */
export async function reactivateStageTask(
  supabaseAdmin: AdminClient,
  stageId: string,
) {
  const { error } = await supabaseAdmin
    .from("tasks")
    .update({
      status: "in_progress",
      completed_at: null,
    })
    .eq("stage_id", stageId);
  if (error) throw new Error(error.message);
}

/** Move a pending stage's task into In Progress when that stage becomes active. */
export async function activateStageTask(
  supabaseAdmin: AdminClient,
  stageId: string,
) {
  const { error } = await supabaseAdmin
    .from("tasks")
    .update({
      status: "in_progress",
      completed_at: null,
    })
    .eq("stage_id", stageId)
    .neq("status", "done");
  if (error) throw new Error(error.message);
}

/** Keep title / due date aligned when admins edit stage details. */
export async function updateStageTaskMeta(
  supabaseAdmin: AdminClient,
  opts: {
    stageId: string;
    stageName: string | null;
    deadline: string | null;
  },
) {
  const { error } = await supabaseAdmin
    .from("tasks")
    .update({
      title: stageTaskTitle(opts.stageName),
      due_date: opts.deadline,
    })
    .eq("stage_id", opts.stageId);
  if (error) throw new Error(error.message);
}

export async function deleteStageTask(
  supabaseAdmin: AdminClient,
  stageId: string,
) {
  const { error } = await supabaseAdmin
    .from("tasks")
    .delete()
    .eq("stage_id", stageId);
  if (error) throw new Error(error.message);
}

/**
 * When a user loses case access (removed from team or override = none):
 * clear their stage assignments, drop linked stage tasks, and unassign
 * their other case tasks so they disappear from the Tasks board.
 */
export async function revokeUserCaseWork(
  supabaseAdmin: AdminClient,
  opts: { caseId: string; userId: string },
) {
  const { data: stages, error: stageErr } = await supabaseAdmin
    .from("case_stages")
    .select("id")
    .eq("case_id", opts.caseId)
    .eq("assignee_id", opts.userId);
  if (stageErr) throw new Error(stageErr.message);

  const stageIds = (stages ?? []).map((s: { id: string }) => s.id);
  if (stageIds.length) {
    const { error: clearErr } = await supabaseAdmin
      .from("case_stages")
      .update({ assignee_id: null })
      .in("id", stageIds);
    if (clearErr) throw new Error(clearErr.message);

    const { error: delStageTasksErr } = await supabaseAdmin
      .from("tasks")
      .delete()
      .in("stage_id", stageIds);
    if (delStageTasksErr) throw new Error(delStageTasksErr.message);
  }

  // Stage-linked tasks for this user on the case (belt-and-suspenders).
  const { error: delLinkedErr } = await supabaseAdmin
    .from("tasks")
    .delete()
    .eq("case_id", opts.caseId)
    .eq("assignee_id", opts.userId)
    .not("stage_id", "is", null);
  if (delLinkedErr) throw new Error(delLinkedErr.message);

  // Keep ordinary tasks for admins, but remove this user as assignee.
  const { error: unassignErr } = await supabaseAdmin
    .from("tasks")
    .update({ assignee_id: null })
    .eq("case_id", opts.caseId)
    .eq("assignee_id", opts.userId)
    .is("stage_id", null);
  if (unassignErr) throw new Error(unassignErr.message);
}
