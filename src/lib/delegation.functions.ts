import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DelegationRow {
  doc_type: string;
  allowed_roles: string[];
}

export const getDelegations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DelegationRow[]> => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    
    if (role !== "super_admin") {
      throw new Error("Only Super Admins can view delegation settings.");
    }

    const { data, error } = await supabase
      .from("document_approval_delegations")
      .select("doc_type, allowed_roles")
      .order("doc_type");

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { doc_type: string; allowed_roles: string[] }) => {
    if (!input?.doc_type) throw new Error("Document type required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: role } = await supabase.rpc("current_role");
    
    if (role !== "super_admin") {
      throw new Error("Only Super Admins can update delegation settings.");
    }

    const { error } = await supabase
      .from("document_approval_delegations")
      .upsert({
        doc_type: data.doc_type,
        allowed_roles: data.allowed_roles,
      });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
