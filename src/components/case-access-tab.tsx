import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import { getCaseAccessMatrix, type CaseAccessRow } from "@/lib/cases.functions";
import {
  setCaseAccessOverride,
  clearCaseAccessOverride,
} from "@/lib/case-access.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const FOLDERS: { code: string; name: string }[] = [
  { code: "01", name: "Client Documents" },
  { code: "02", name: "Correspondence" },
  { code: "03", name: "Internal Drafts" },
  { code: "04", name: "Approved Documents" },
  { code: "05", name: "Court Filings" },
  { code: "06", name: "Research and Notes" },
  { code: "07", name: "Billing" },
];

const FOLDER_NAME: Record<string, string> = Object.fromEntries(
  FOLDERS.map((f) => [f.code, f.name]),
);

// Override choices, including "default" which clears any override.
type OverrideChoice = "default" | "full" | "read_only" | "none";

function levelTagColor(level: string): "green" | "blue" | "sand" {
  if (level === "full") return "green";
  if (level === "read_only") return "blue";
  return "sand";
}

function formatScope(scope: string | null): string {
  const codes = (scope ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return "All folders";
  return codes.map((c) => FOLDER_NAME[c] ?? c).join(", ");
}

export function CaseAccessTab({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const fetchMatrix = useServerFn(getCaseAccessMatrix);
  const setOverride = useServerFn(setCaseAccessOverride);
  const clearOverride = useServerFn(clearCaseAccessOverride);

  const { data, isLoading, error } = useQuery({
    queryKey: ["case-access", caseId],
    queryFn: () => fetchMatrix({ data: { caseId } }),
  });

  const [editing, setEditing] = useState<CaseAccessRow | null>(null);
  const [choice, setChoice] = useState<OverrideChoice>("default");
  const [scope, setScope] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditor(row: CaseAccessRow) {
    setEditing(row);
    setChoice((row.override_level as OverrideChoice) ?? "default");
    setScope(
      (row.folder_scope ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    setNote("");
  }

  function toggleFolder(code: string, checked: boolean) {
    setScope((prev) =>
      checked ? [...new Set([...prev, code])] : prev.filter((c) => c !== code),
    );
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      if (choice === "default") {
        await clearOverride({
          data: { caseId, targetUserId: editing.user_id },
        });
        toast.success("Override removed — reverted to role default.");
      } else {
        await setOverride({
          data: {
            caseId,
            targetUserId: editing.user_id,
            accessLevel: choice,
            folderScope: choice === "none" ? null : scope,
            note: note || null,
          },
        });
        toast.success(
          choice === "none"
            ? "Access revoked. The user is signed out of this case immediately."
            : "Access updated — takes effect immediately.",
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["case-access", caseId] });
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-0">
      <div className="border-b border-border p-5">
        <h3 className="text-sm font-semibold text-foreground">Team access</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Effective access for each team member on this case. Changes are
          enforced immediately through row-level security.
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
                <th className="px-5 py-3 font-medium text-right">Actions</th>
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
                    {formatScope(row.folder_scope)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.role === "super_admin" ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditor(row)}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Edit case access
            </DialogTitle>
            <DialogDescription>
              {editing?.full_name} ·{" "}
              {ROLE_LABELS[editing?.role ?? ""] ?? editing?.role}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Access level</Label>
              <Select
                value={choice}
                onValueChange={(v) => setChoice(v as OverrideChoice)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    Role default ({LEVEL_LABELS[editing?.role_default ?? "none"]})
                  </SelectItem>
                  <SelectItem value="full">Full access</SelectItem>
                  <SelectItem value="read_only">Read only</SelectItem>
                  <SelectItem value="none">Restrict — no access</SelectItem>
                </SelectContent>
              </Select>
              {choice === "none" && (
                <p className="text-xs text-muted-foreground">
                  Blocks this user even if their role would normally grant access.
                  They are signed out of this case immediately.
                </p>
              )}
            </div>

            {(choice === "full" || choice === "read_only") && (
              <div className="space-y-2">
                <Label>Folder scope</Label>
                <p className="text-xs text-muted-foreground">
                  Leave all unchecked for every folder this user can reach, or
                  select specific folders to narrow access.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FOLDERS.map((f) => (
                    <label
                      key={f.code}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={scope.includes(f.code)}
                        onCheckedChange={(c) => toggleFolder(f.code, c === true)}
                      />
                      <span>
                        {f.code} {f.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="access-note">Note (optional)</Label>
              <Textarea
                id="access-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for this change"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
