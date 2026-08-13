import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  addCaseTeamMember,
  listCaseTeam,
  removeCaseTeamMember,
  updateTeamMemberBillingRate,
} from "@/lib/case-lifecycle.functions";
import { listAssignableStaff } from "@/lib/users.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
};

export function CaseTeamTab({
  caseId,
  onChangeLead,
}: {
  caseId: string;
  onChangeLead?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(listCaseTeam);
  const fetchStaff = useServerFn(listAssignableStaff);
  const addMember = useServerFn(addCaseTeamMember);
  const removeMember = useServerFn(removeCaseTeamMember);
  const setBillingRate = useServerFn(updateTeamMemberBillingRate);

  const [pickId, setPickId] = useState("");

  const { data: team = [], isLoading, error } = useQuery({
    queryKey: ["case-team", caseId],
    queryFn: () => fetchTeam({ data: { caseId } }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["assignable-staff"],
    queryFn: () => fetchStaff(),
  });

  const onTeam = useMemo(() => new Set(team.map((m) => m.userId)), [team]);
  const available = staff.filter((s) => !onTeam.has(s.id));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["case-team", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    queryClient.invalidateQueries({ queryKey: ["cases"] });
    queryClient.invalidateQueries({ queryKey: ["document-visibility"] });
    queryClient.invalidateQueries({ queryKey: ["case-access", caseId] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["case-stages", caseId] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!pickId) throw new Error("Choose a lawyer to add.");
      return addMember({ data: { caseId, userId: pickId } });
    },
    onSuccess: (res) => {
      toast.success(`Added ${res.fullName ?? "lawyer"} to the matter team`);
      setPickId("");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      removeMember({ data: { caseId, userId } }),
    onSuccess: () => {
      toast.success("Removed from matter team");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rateMutation = useMutation({
    mutationFn: ({ userId, billingRate }: { userId: string; billingRate: number | null }) =>
      setBillingRate({ data: { caseId, userId, billingRate } }),
    onSuccess: () => {
      toast.success("Billing rate updated");
      queryClient.invalidateQueries({ queryKey: ["case-team", caseId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading matter team…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load team."}
        </p>
      </Card>
    );
  }

  const lead = team.find((m) => m.isLead);
  const others = team.filter((m) => !m.isLead);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Matter team</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              One lead lawyer, plus as many other lawyers as you need on this
              matter.
            </p>
          </div>
          {onChangeLead ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/[0.12] bg-white/[0.04]"
              onClick={onChangeLead}
            >
              {lead ? "Change lead" : "Assign lead"}
            </Button>
          ) : null}
        </div>

        <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
          {team.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">
              No lawyers assigned yet. Assign a lead, then add additional
              lawyers below.
            </li>
          ) : (
            <>
              {lead ? (
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {lead.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[lead.role] ?? lead.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <BillingRateField
                      value={lead.billingRate}
                      onSave={(rate) => rateMutation.mutate({ userId: lead.userId, billingRate: rate })}
                    />
                    <Badge className="bg-white/[0.1] text-foreground">Lead</Badge>
                  </div>
                </li>
              ) : null}
              {others.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <BillingRateField
                      value={m.billingRate}
                      onSave={(rate) => rateMutation.mutate({ userId: m.userId, billingRate: rate })}
                    />
                    <Badge
                      variant="outline"
                      className="border-white/[0.12] text-muted-foreground"
                    >
                      Lawyer
                    </Badge>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(m.userId)}
                      aria-label={`Remove ${m.fullName}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </>
          )}
        </ul>

        <div className="space-y-2 border-t border-white/[0.06] pt-4">
          <Label>Add another lawyer</Label>
          <div className="flex flex-wrap gap-2">
            <Select value={pickId || undefined} onValueChange={setPickId}>
              <SelectTrigger className="min-w-[14rem] flex-1 border-white/[0.1] bg-white/[0.03]">
                <SelectValue placeholder="Select staff…" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    Everyone eligible is already on the team
                  </SelectItem>
                ) : (
                  available.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name ?? "Unnamed"} ·{" "}
                      {ROLE_LABELS[s.role] ?? s.role}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={!pickId || addMutation.isPending}
              onClick={() => addMutation.mutate()}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              {addMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BillingRateField({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (rate: number | null) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>$</span>
      <Input
        type="number"
        min={0}
        step="0.01"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = text.trim() === "" ? null : Number(text);
          if (n !== value) onSave(Number.isFinite(n as number) ? n : null);
        }}
        placeholder="rate/hr"
        className="h-7 w-20 border-white/[0.1] bg-white/[0.03] px-1.5 text-xs"
      />
    </div>
  );
}
