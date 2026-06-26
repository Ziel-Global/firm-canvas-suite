import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/lib/nav";

export interface WorkflowTemplate {
  id: string;
  name: string | null;
  case_type: string | null;
  description: string | null;
  is_active: boolean | null;
  created_at: string;
  stage_count: number;
}

export interface WorkflowTemplateStage {
  id: string;
  template_id: string | null;
  name: string | null;
  sequence_order: number | null;
  responsible_role: AppRole | null;
  expected_output: string | null;
  deadline_days: number | null;
}

export interface StageInput {
  name: string;
  responsible_role: AppRole;
  expected_output: string;
  deadline_days: number | null;
}

/** List all workflow templates with their stage counts (super_admin / admin via RLS). */
export const listWorkflowTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkflowTemplate[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("workflow_templates")
      .select(
        "id, name, case_type, description, is_active, created_at, workflow_template_stages(count)",
      )
      .order("case_type", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => {
      const counts = t.workflow_template_stages as unknown as
        | { count: number }[]
        | null;
      return {
        id: t.id,
        name: t.name,
        case_type: t.case_type,
        description: t.description,
        is_active: t.is_active,
        created_at: t.created_at,
        stage_count: counts?.[0]?.count ?? 0,
      };
    });
  });

/** Fetch a single template with its ordered stages. */
export const getWorkflowTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      template: WorkflowTemplate;
      stages: WorkflowTemplateStage[];
    }> => {
      const { supabase } = context;
      const { data: tpl, error: tErr } = await supabase
        .from("workflow_templates")
        .select("id, name, case_type, description, is_active, created_at")
        .eq("id", data.id)
        .single();
      if (tErr) throw new Error(tErr.message);

      const { data: stages, error: sErr } = await supabase
        .from("workflow_template_stages")
        .select(
          "id, template_id, name, sequence_order, responsible_role, expected_output, deadline_days",
        )
        .eq("template_id", data.id)
        .order("sequence_order", { ascending: true });
      if (sErr) throw new Error(sErr.message);

      return {
        template: { ...tpl, stage_count: stages?.length ?? 0 },
        stages: (stages ?? []) as WorkflowTemplateStage[],
      };
    },
  );

/** Create a new template. Returns the new id. */
export const createWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      case_type: string;
      description: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("workflow_templates")
      .insert({
        name: data.name.trim(),
        case_type: data.case_type.trim() || null,
        description: data.description.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** Update template metadata. */
export const updateWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      name: string;
      case_type: string;
      description: string;
      is_active: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("workflow_templates")
      .update({
        name: data.name.trim(),
        case_type: data.case_type.trim() || null,
        description: data.description.trim() || null,
        is_active: data.is_active,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete a template (cascade removes its stages). */
export const deleteWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("workflow_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Replace the full ordered list of stages for a template. */
export const saveTemplateStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { template_id: string; stages: StageInput[] }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: delErr } = await supabase
      .from("workflow_template_stages")
      .delete()
      .eq("template_id", data.template_id);
    if (delErr) throw new Error(delErr.message);

    if (data.stages.length > 0) {
      const rows = data.stages.map((s, idx) => ({
        template_id: data.template_id,
        name: s.name.trim(),
        sequence_order: idx + 1,
        responsible_role: s.responsible_role,
        expected_output: s.expected_output.trim() || null,
        deadline_days: s.deadline_days,
      }));
      const { error: insErr } = await supabase
        .from("workflow_template_stages")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true };
  });
