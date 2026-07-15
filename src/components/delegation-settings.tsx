import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { getDelegations, updateDelegation } from "@/lib/delegation.functions";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings-section";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/loading-skeletons";

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

  async function handleToggleRole(
    docType: string,
    currentRoles: string[],
    targetRole: string,
  ) {
    if (savingDocType) return;
    setSavingDocType(docType);

    const isEnabled = currentRoles.includes(targetRole);
    const newRoles = isEnabled
      ? currentRoles.filter((r) => r !== targetRole)
      : [...currentRoles, targetRole];

    try {
      await saveDelegation({
        data: { doc_type: docType, allowed_roles: newRoles },
      });
      toast.success("Delegation updated");
      queryClient.setQueryData(["approval-delegations"], (old: any) =>
        old?.map((d: any) =>
          d.doc_type === docType ? { ...d, allowed_roles: newRoles } : d,
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update delegation",
      );
    } finally {
      setSavingDocType(null);
    }
  }

  return (
    <SettingsSection
      eyebrow="Approvals"
      title="Approval delegations"
      description="Grant Admin or Senior Lawyer authority to approve specific document types. Super Admins always retain final approval power."
    >
      {isLoading ? (
        <div className="p-2">
          <ListSkeleton rows={3} className="border-0 shadow-none" />
        </div>
      ) : delegations && delegations.length > 0 ? (
        <ul className="divide-y divide-white/[0.06]">
          {delegations.map((del) => {
            const saving = savingDocType === del.doc_type;
            return (
              <li
                key={del.doc_type}
                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
                    <BadgeCheck className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-foreground">
                      {del.doc_type} documents
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Toggle who may approve this type
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                  {(["admin", "senior_lawyer"] as const).map((target) => {
                    const active = del.allowed_roles.includes(target);
                    return (
                      <Button
                        key={target}
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          handleToggleRole(
                            del.doc_type,
                            del.allowed_roles,
                            target,
                          )
                        }
                        className={cn(
                          "h-8 border px-3 text-xs",
                          active
                            ? "border-white/15 bg-white/[0.12] text-foreground hover:bg-white/[0.16]"
                            : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                        )}
                      >
                        {saving ? (
                          <Loader2 className="mr-1.5 size-3 animate-spin" />
                        ) : null}
                        {target === "admin" ? "Admin" : "Senior Lawyer"}
                      </Button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="px-5 py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            No document types configured
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Delegation rows appear once document types exist.
          </p>
        </div>
      )}
    </SettingsSection>
  );
}
