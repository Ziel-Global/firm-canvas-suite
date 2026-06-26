import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCaseAccessMatrix, type CaseAccessRow } from "@/lib/cases.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
  support: "Support",
};

const LEVEL_LABELS: Record<string, string> = {
  full: "Full",
  read_only: "Read only",
  none: "No access",
};

function levelTagColor(level: string): "green" | "blue" | "sand" {
  if (level === "full") return "green";
  if (level === "read_only") return "blue";
  return "sand";
}

export function CaseAccessTab({ caseId }: { caseId: string }) {
  const fetchMatrix = useServerFn(getCaseAccessMatrix);

  const { data, isLoading, error } = useQuery({
    queryKey: ["case-access", caseId],
    queryFn: () => fetchMatrix({ data: { caseId } }),
  });

  return (
    <Card className="p-0">
      <div className="border-b border-border p-5">
        <h3 className="text-sm font-semibold text-foreground">Team access</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Effective access for each team member on this case.
        </p>
      </div>

      {isLoading && (
        <p className="p-5 text-sm text-muted-foreground">Loading access…</p>
      )}
      {error && !isLoading && (
        <p className="p-5 text-sm text-destructive">Could not load access matrix.</p>
      )}

      {data && !isLoading && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Role default</th>
                <th className="px-5 py-3 font-medium">Override</th>
                <th className="px-5 py-3 font-medium">Effective</th>
                <th className="px-5 py-3 font-medium">Folder scope</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: CaseAccessRow) => (
                <tr key={row.user_id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-foreground">
                      {row.full_name ?? "—"}
                      {!row.is_active && (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ROLE_LABELS[row.role ?? ""] ?? row.role ?? "—"}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {LEVEL_LABELS[row.role_default] ?? row.role_default}
                  </td>
                  <td className="px-5 py-3">
                    {row.override_level ? (
                      <Badge>{LEVEL_LABELS[row.override_level] ?? row.override_level}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Tag color={levelTagColor(row.effective_level)}>
                      {LEVEL_LABELS[row.effective_level] ?? row.effective_level}
                    </Tag>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {row.folder_scope?.trim() ? row.folder_scope : "All folders"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
