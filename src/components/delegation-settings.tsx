import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { getDelegations, updateDelegation } from "@/lib/delegation.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DelegationSettings() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const fetchDelegations = useServerFn(getDelegations);
  const saveDelegation = useServerFn(updateDelegation);
  const queryClient = useQueryClient();

  const [savingDocType, setSavingDocType] = useState<string | null>(null);

  const { data: delegations, isLoading } = useQuery({
    queryKey: ["approval-delegations"],
    queryFn: () => fetchDelegations(),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) return null;

  async function handleToggleRole(docType: string, currentRoles: string[], targetRole: string) {
    if (savingDocType) return;
    setSavingDocType(docType);

    const isEnabled = currentRoles.includes(targetRole);
    const newRoles = isEnabled 
      ? currentRoles.filter(r => r !== targetRole)
      : [...currentRoles, targetRole];

    try {
      await saveDelegation({ data: { doc_type: docType, allowed_roles: newRoles } });
      toast.success("Delegation updated");
      queryClient.setQueryData(["approval-delegations"], (old: any) => 
        old?.map((d: any) => d.doc_type === docType ? { ...d, allowed_roles: newRoles } : d)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update delegation");
    } finally {
      setSavingDocType(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-foreground">Approval Delegations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant Admin or Senior Lawyer roles the authority to approve specific document types (e.g. low-stakes documents). Super Admins always retain final approval power across all documents.
        </p>
      </div>

      <Card className="divide-y divide-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading delegations...</div>
        ) : delegations && delegations.length > 0 ? (
          delegations.map((del) => (
            <div key={del.doc_type} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
              <div className="font-medium text-foreground">
                {del.doc_type} Documents
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={del.allowed_roles.includes("admin") ? "default" : "outline"}
                  size="sm"
                  disabled={savingDocType === del.doc_type}
                  onClick={() => handleToggleRole(del.doc_type, del.allowed_roles, "admin")}
                  className={del.allowed_roles.includes("admin") ? "bg-tag-blue text-white hover:bg-tag-blue/90" : ""}
                >
                  {savingDocType === del.doc_type ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                  Admin
                </Button>
                <Button
                  variant={del.allowed_roles.includes("senior_lawyer") ? "default" : "outline"}
                  size="sm"
                  disabled={savingDocType === del.doc_type}
                  onClick={() => handleToggleRole(del.doc_type, del.allowed_roles, "senior_lawyer")}
                  className={del.allowed_roles.includes("senior_lawyer") ? "bg-tag-blue text-white hover:bg-tag-blue/90" : ""}
                >
                  {savingDocType === del.doc_type ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                  Senior Lawyer
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-sm text-muted-foreground">No document types configured.</div>
        )}
      </Card>
    </div>
  );
}
