import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, ShieldCheck } from "lucide-react";

import { getCaseAccessMatrix, type CaseAccessRow } from "@/lib/cases.functions";
import {
  setCaseAccessOverride,
  clearCaseAccessOverride,
} from "@/lib/case-access.functions";
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
import { cn } from "@/lib/utils";

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

type OverrideChoice = "default" | "full" | "read_only" | "none";

const BTN_SOFT =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 text-xs font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

const BTN_LIGHT =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-b from-[#F8F8F8] to-[#D4D4D4] px-4 text-xs font-semibold text-[#14161a] shadow-[0_8px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] transition-[filter,transform] hover:brightness-110 hover:text-[#14161a] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:text-[#14161a]";

function formatScope(scope: string | null): string {
  const codes = (scope ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return "All folders";
  return codes.map((c) => FOLDER_NAME[c] ?? c).join(", ");
}

function LevelChip({
  level,
  muted = false,
}: {
  level: string;
  muted?: boolean;
}) {
  const label = LEVEL_LABELS[level] ?? level;
  if (muted) {
    return (
      <span className="text-sm text-muted-foreground">{label}</span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap items-center rounded-lg px-2 py-0.5 text-[11px] font-medium",
        level === "full" && "bg-status-ontrack/18 text-status-ontrack",
        level === "read_only" && "bg-tag-blue/18 text-tag-blue",
        level === "none" && "bg-tag-sand/18 text-tag-sand",
        !["full", "read_only", "none"].includes(level) &&
          "bg-white/[0.08] text-foreground/80",
      )}
    >
      {label}
    </span>
  );
}

function initials(name: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
            ? "Access revoked. The user is signed out of this matter immediately."
            : "Access updated — takes effect immediately.",
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["case-access", caseId] });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["case-stages", caseId] });
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-tag-blue/15 bg-gradient-to-br from-tag-blue/[0.08] via-[rgba(18,18,20,0.72)] to-[rgba(18,18,20,0.55)] shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)]">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl border border-tag-blue/30 bg-tag-blue/15 text-tag-blue">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-tag-blue/85">
                Permissions
              </p>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                Team access
              </h3>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Effective access for each person on this case. Overrides apply
            immediately through row-level security.
          </p>
        </div>

        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Loading access…
          </p>
        ) : null}
        {error && !isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-destructive">
            Could not load access matrix.
          </p>
        ) : null}

        {data && !isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Role default</th>
                  <th className="px-5 py-3 font-medium">Override</th>
                  <th className="px-5 py-3 font-medium">Effective</th>
                  <th className="px-5 py-3 font-medium">Folder scope</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row: CaseAccessRow) => (
                  <tr
                    key={row.user_id}
                    className="border-b border-white/[0.05] transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.05] text-[11px] font-semibold tracking-wide text-foreground/90">
                          {initials(row.full_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {row.full_name ?? "—"}
                            {!row.is_active ? (
                              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                Inactive
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {ROLE_LABELS[row.role ?? ""] ?? row.role ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-muted-foreground">
                        {LEVEL_LABELS[row.role_default] ?? row.role_default}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {row.override_level ? (
                        <LevelChip level={row.override_level} />
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <LevelChip level={row.effective_level} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-muted-foreground">
                        {formatScope(row.folder_scope)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {row.role === "super_admin" ? (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      ) : (
                        <button
                          type="button"
                          className={BTN_SOFT}
                          onClick={() => openEditor(row)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="border-white/[0.1] bg-[rgba(18,18,20,0.96)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl border border-tag-blue/30 bg-tag-blue/15 text-tag-blue">
                <ShieldCheck className="size-4" />
              </span>
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
                <SelectTrigger className="rounded-xl border-white/[0.1] bg-white/[0.03]">
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
              {choice === "none" ? (
                <p className="text-xs text-muted-foreground">
                  Blocks this user even if their role would normally grant access.
                  They are signed out of this case immediately.
                </p>
              ) : null}
            </div>

            {(choice === "full" || choice === "read_only") && (
              <div className="space-y-2">
                <Label>Folder scope</Label>
                <p className="text-xs text-muted-foreground">
                  Leave all unchecked for every folder this user can reach, or
                  select specific folders to narrow access.
                </p>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:grid-cols-2">
                  {FOLDERS.map((f) => (
                    <label
                      key={f.code}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-white/[0.03]"
                    >
                      <Checkbox
                        checked={scope.includes(f.code)}
                        onCheckedChange={(c) => toggleFolder(f.code, c === true)}
                      />
                      <span className="text-foreground/90">
                        <span className="text-tag-blue/80">{f.code}</span> {f.name}
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
                className="rounded-xl border-white/[0.1] bg-black/20"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className={BTN_SOFT}
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={BTN_LIGHT}
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save access"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
