import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

import {
  getDocumentVisibility,
  setDocumentVisibility,
  type DocumentVisibilityMode,
  type StaffCaseRole,
} from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { role: StaffCaseRole; label: string }[] = [
  { role: "senior_lawyer", label: "Senior Lawyers" },
  { role: "junior_lawyer", label: "Junior Lawyers" },
  { role: "support", label: "Support" },
];

const MODE_OPTIONS: {
  mode: DocumentVisibilityMode;
  title: string;
  description: string;
}[] = [
  {
    mode: "open",
    title: "Open to case team",
    description: "Anyone with folder access can see it. Optionally lock specific people or roles out.",
  },
  {
    mode: "allowlist",
    title: "Allow only selected",
    description: "Only the people and roles you tick can see it (admins always can).",
  },
  {
    mode: "admin_only",
    title: "Lock for everyone",
    description: "Hidden from the whole case team. Only admins can see it.",
  },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.role === role)?.label ?? role.replace(/_/g, " ");
}

export function DocumentVisibilityPanel({
  caseId,
  documentId,
  documentTitle,
}: {
  caseId: string;
  documentId: string;
  documentTitle: string;
}) {
  const queryClient = useQueryClient();
  const fetchVisibility = useServerFn(getDocumentVisibility);
  const saveVisibility = useServerFn(setDocumentVisibility);

  const { data, isLoading, error } = useQuery({
    queryKey: ["document-visibility", caseId, documentId],
    queryFn: () => fetchVisibility({ data: { caseId, documentId } }),
  });

  const [mode, setMode] = useState<DocumentVisibilityMode>("open");
  const [allowedUsers, setAllowedUsers] = useState<Set<string>>(new Set());
  const [allowedRoles, setAllowedRoles] = useState<Set<string>>(new Set());
  const [deniedUsers, setDeniedUsers] = useState<Set<string>>(new Set());
  const [deniedRoles, setDeniedRoles] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setAllowedUsers(
      new Set(
        data.rules
          .filter((r) => r.effect === "allow" && r.subjectType === "user" && r.userId)
          .map((r) => r.userId as string),
      ),
    );
    setAllowedRoles(
      new Set(
        data.rules
          .filter((r) => r.effect === "allow" && r.subjectType === "role" && r.role)
          .map((r) => r.role as string),
      ),
    );
    setDeniedUsers(
      new Set(
        data.rules
          .filter((r) => r.effect === "deny" && r.subjectType === "user" && r.userId)
          .map((r) => r.userId as string),
      ),
    );
    setDeniedRoles(
      new Set(
        data.rules
          .filter((r) => r.effect === "deny" && r.subjectType === "role" && r.role)
          .map((r) => r.role as string),
      ),
    );
  }, [data]);

  const summary = useMemo(() => {
    if (mode === "admin_only") return "Locked for everyone except admins";
    if (mode === "allowlist") {
      const n = allowedUsers.size + allowedRoles.size;
      return n === 0 ? "Allowlist empty — only admins / uploader see it" : `Allowed: ${n} selection(s)`;
    }
    const n = deniedUsers.size + deniedRoles.size;
    return n === 0 ? "Open to case team" : `Open, with ${n} lock(s)`;
  }, [mode, allowedUsers, allowedRoles, deniedUsers, deniedRoles]);

  function toggle(set: Set<string>, id: string, checked: boolean, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (checked) next.add(id);
    else next.delete(id);
    setter(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const rules =
        mode === "admin_only"
          ? []
          : mode === "allowlist"
            ? [
                ...[...allowedUsers].map((userId) => ({
                  effect: "allow" as const,
                  subjectType: "user" as const,
                  userId,
                })),
                ...[...allowedRoles].map((role) => ({
                  effect: "allow" as const,
                  subjectType: "role" as const,
                  role,
                })),
              ]
            : [
                ...[...deniedUsers].map((userId) => ({
                  effect: "deny" as const,
                  subjectType: "user" as const,
                  userId,
                })),
                ...[...deniedRoles].map((role) => ({
                  effect: "deny" as const,
                  subjectType: "role" as const,
                  role,
                })),
              ];

      await saveVisibility({
        data: { caseId, documentId, mode, rules },
      });
      toast.success("Document access updated");
      queryClient.invalidateQueries({ queryKey: ["document-visibility", caseId, documentId] });
      queryClient.invalidateQueries({ queryKey: ["folder-documents", caseId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save access");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading document access…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load document access."}
        </p>
      </Card>
    );
  }

  const team = data?.team ?? [];
  const peopleSet = mode === "allowlist" ? allowedUsers : deniedUsers;
  const rolesSet = mode === "allowlist" ? allowedRoles : deniedRoles;
  const setPeople = mode === "allowlist" ? setAllowedUsers : setDeniedUsers;
  const setRoles = mode === "allowlist" ? setAllowedRoles : setDeniedRoles;
  const pickLabel = mode === "allowlist" ? "Can see" : "Locked out";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">Document access</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Control who on this case can see <span className="text-foreground">{documentTitle}</span>.
            Admins always retain access.
          </p>
        </div>
        <Pill className="bg-white/[0.06] text-muted-foreground">{summary}</Pill>
      </div>

      <div className="space-y-2">
        {MODE_OPTIONS.map((option) => {
          const active = mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => setMode(option.mode)}
              className={cn(
                "w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-tag-blue/40 bg-tag-blue/10"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]",
              )}
            >
              <div className="text-sm font-medium text-foreground">{option.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{option.description}</div>
            </button>
          );
        })}
      </div>

      {mode !== "admin_only" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              By role · {pickLabel}
            </Label>
            <div className="space-y-2 rounded-[var(--radius-control)] border border-white/[0.08] p-3">
              {ROLE_OPTIONS.map((opt) => (
                <label key={opt.role} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={rolesSet.has(opt.role)}
                    onCheckedChange={(checked) =>
                      toggle(rolesSet, opt.role, checked === true, setRoles)
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              By name · {pickLabel}
            </Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-[var(--radius-control)] border border-white/[0.08] p-3">
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No one is appointed on this case yet. Assign people on the Access tab first.
                </p>
              ) : (
                team.map((member) => (
                  <label
                    key={member.userId}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={peopleSet.has(member.userId)}
                      onCheckedChange={(checked) =>
                        toggle(peopleSet, member.userId, checked === true, setPeople)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {member.fullName}
                        {member.isLead ? " · Lead" : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {roleLabel(member.role)}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save access
        </Button>
      </div>
    </Card>
  );
}
