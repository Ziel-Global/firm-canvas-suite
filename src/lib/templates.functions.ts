import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DocumentTemplate {
  id: string;
  name: string;
  doc_type: string;
  body: string;
  fields_schema: any;
  created_at: string;
  updated_at: string;
}

export const getTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DocumentTemplate[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("document_templates")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    if (!data) return [];
    
    return data.map((d: any) => ({
      id: d.id,
      name: d.name,
      doc_type: d.doc_type,
      body: d.body,
      fields_schema: d.fields_schema,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; name: string; doc_type: string; body: string; fields_schema: any }) => {
    if (!input?.id) throw new Error("Template id required.");
    if (!input?.name) throw new Error("Template name required.");
    if (!input?.doc_type) throw new Error("Document type required.");
    if (!input?.body) throw new Error("Template body required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    
    if (role !== "super_admin" && role !== "admin") {
      throw new Error("Only administrators can update templates.");
    }

    const { error } = await supabase
      .from("document_templates")
      .update({
        name: data.name,
        doc_type: data.doc_type,
        body: data.body,
        fields_schema: data.fields_schema,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
