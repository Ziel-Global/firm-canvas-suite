import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Save, X } from "lucide-react";

import {
  FIRM_SETTING_DEFAULTS,
  getFirmSettings,
  updateFirmSettings,
  type FirmSettingsValues,
} from "@/lib/firm-settings.functions";
import { notifySessionTimeoutChanged } from "@/lib/firm-settings-events";
import {
  minutesToParts,
  partsToMinutes,
  type ReminderUnit,
} from "@/lib/reminder-utils";
import { useAuth } from "@/contexts/auth-context";
import { SettingsSection } from "@/components/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PremiumLoaderPanel } from "@/components/premium-loader";

interface OffsetDraft {
  id: string;
  value: number;
  unit: ReminderUnit;
}

let offsetId = 0;
function nextOffsetId() {
  offsetId += 1;
  return `fo${offsetId}`;
}

function offsetsToDraft(minutes: number[]): OffsetDraft[] {
  return [...minutes]
    .sort((a, b) => b - a)
    .map((m) => ({ id: nextOffsetId(), ...minutesToParts(m) }));
}

function draftToOffsets(draft: OffsetDraft[]): number[] {
  return Array.from(
    new Set(
      draft
        .map((d) => partsToMinutes(d.value, d.unit))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ).sort((a, b) => b - a);
}

export function FirmSettingsPanel() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const load = useServerFn(getFirmSettings);
  const save = useServerFn(updateFirmSettings);

  const { data, isLoading, error } = useQuery({
    queryKey: ["firm-settings"],
    queryFn: () => load(),
    enabled: role === "super_admin",
  });

  const [draft, setDraft] = useState<FirmSettingsValues | null>(null);
  const [offsetDraft, setOffsetDraft] = useState<OffsetDraft[]>([]);

  useEffect(() => {
    if (!data) return;
    setDraft(data);
    setOffsetDraft(offsetsToDraft(data.reminder_offsets));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const offsets = draftToOffsets(offsetDraft);
    return (
      draft.retention_days !== data.retention_days ||
      draft.session_timeout_minutes !== data.session_timeout_minutes ||
      draft.morning_digest_time !== data.morning_digest_time ||
      draft.max_failed_logins !== data.max_failed_logins ||
      draft.lockout_minutes !== data.lockout_minutes ||
      offsets.join(",") !== data.reminder_offsets.join(",")
    );
  }, [data, draft, offsetDraft]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Nothing to save.");
      return save({
        data: {
          retention_days: draft.retention_days,
          session_timeout_minutes: draft.session_timeout_minutes,
          morning_digest_time: draft.morning_digest_time,
          max_failed_logins: draft.max_failed_logins,
          lockout_minutes: draft.lockout_minutes,
          reminder_offsets: draftToOffsets(offsetDraft),
        },
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["firm-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["reminder-defaults"] });
      queryClient.invalidateQueries({ queryKey: ["reminder-defaults-settings"] });
      queryClient.invalidateQueries({ queryKey: ["morning-digest"] });
      notifySessionTimeoutChanged(next.session_timeout_minutes);
      toast.success("Firm settings saved");
      setDraft(next);
      setOffsetDraft(offsetsToDraft(next.reminder_offsets));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    },
  });

  if (role !== "super_admin") {
    return (
      <SettingsSection
        eyebrow="Firm policy"
        title="Firm settings"
        description="Retention, session security, reminders, and digest delivery."
      >
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Firm settings are available to the Super Admin only.
        </div>
      </SettingsSection>
    );
  }

  if (isLoading || !draft) {
    return (
      <SettingsSection
        eyebrow="Firm policy"
        title="Firm settings"
        description="Retention, session security, reminders, and digest delivery."
      >
        <div className="px-5 py-10">
          <PremiumLoaderPanel label="Loading firm settings…" />
        </div>
      </SettingsSection>
    );
  }

  if (error) {
    return (
      <SettingsSection
        eyebrow="Firm policy"
        title="Firm settings"
        description="Retention, session security, reminders, and digest delivery."
      >
        <div className="px-5 py-8 text-sm text-priority-high">
          {error instanceof Error ? error.message : "Unable to load settings."}
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      eyebrow="Firm policy"
      title="Firm settings"
      description="These values are stored in firm_settings and read live by session, login lockout, case retention, reminders, and the morning digest."
      action={
        <Button
          type="button"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="h-9 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] hover:from-white hover:to-[#d8d8d8]"
        >
          <Save className="size-3.5" />
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
        <Field
          label="Document retention (closed cases)"
          hint="Days after close before documents become eligible for purge. Default 2555 (~7 years)."
        >
          <Input
            type="number"
            min={30}
            max={36500}
            value={draft.retention_days}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      retention_days:
                        Number(e.target.value) || FIRM_SETTING_DEFAULTS.retention_days,
                    }
                  : d,
              )
            }
            className="border-white/[0.08] bg-[#17191D]"
          />
        </Field>

        <Field
          label="Session inactivity timeout"
          hint="Minutes of idle time before automatic sign-out. Takes effect immediately for the current session."
        >
          <Input
            type="number"
            min={5}
            max={1440}
            value={draft.session_timeout_minutes}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      session_timeout_minutes:
                        Number(e.target.value) ||
                        FIRM_SETTING_DEFAULTS.session_timeout_minutes,
                    }
                  : d,
              )
            }
            className="border-white/[0.08] bg-[#17191D]"
          />
        </Field>

        <Field
          label="Morning digest time"
          hint="24-hour local firm time (HH:MM) when the Super Admin digest is sent."
        >
          <Input
            type="time"
            value={draft.morning_digest_time}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, morning_digest_time: e.target.value || "07:30" } : d,
              )
            }
            className="border-white/[0.08] bg-[#17191D]"
          />
        </Field>

        <Field
          label="Failed-login lockout threshold"
          hint="Consecutive failed attempts before the account is locked."
        >
          <Input
            type="number"
            min={3}
            max={20}
            value={draft.max_failed_logins}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      max_failed_logins:
                        Number(e.target.value) ||
                        FIRM_SETTING_DEFAULTS.max_failed_logins,
                    }
                  : d,
              )
            }
            className="border-white/[0.08] bg-[#17191D]"
          />
        </Field>

        <Field
          label="Lockout duration"
          hint="Minutes an account stays locked after hitting the failure threshold."
        >
          <Input
            type="number"
            min={1}
            max={1440}
            value={draft.lockout_minutes}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      lockout_minutes:
                        Number(e.target.value) ||
                        FIRM_SETTING_DEFAULTS.lockout_minutes,
                    }
                  : d,
              )
            }
            className="border-white/[0.08] bg-[#17191D]"
          />
        </Field>

        <div className="space-y-3 lg:col-span-2">
          <div>
            <Label className="text-sm font-medium text-foreground">
              Reminder offset defaults
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Applied to new events (and synced into per-type reminder defaults).
              Offsets are minutes before the event.
            </p>
          </div>

          <ul className="space-y-2">
            {offsetDraft.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5"
              >
                <Input
                  type="number"
                  min={1}
                  value={row.value}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value) || 1);
                    setOffsetDraft((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, value } : r)),
                    );
                  }}
                  className="h-9 w-24 border-white/[0.08] bg-[#17191D]"
                />
                <Select
                  value={row.unit}
                  onValueChange={(unit: ReminderUnit) =>
                    setOffsetDraft((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, unit } : r)),
                    )
                  }
                >
                  <SelectTrigger className="h-9 w-32 border-white/[0.08] bg-[#17191D]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-9 w-9 p-0 text-muted-foreground"
                  onClick={() =>
                    setOffsetDraft((rows) => rows.filter((r) => r.id !== row.id))
                  }
                  disabled={offsetDraft.length <= 1}
                  aria-label="Remove offset"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-white/[0.1] bg-white/[0.03]"
            onClick={() =>
              setOffsetDraft((rows) => [
                ...rows,
                { id: nextOffsetId(), value: 1, unit: "days" },
              ])
            }
          >
            <Plus className="size-3.5" />
            Add offset
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {children}
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}
