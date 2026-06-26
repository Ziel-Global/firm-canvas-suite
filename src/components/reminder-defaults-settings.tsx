import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import {
  getReminderDefaults,
  updateReminderDefault,
  type ReminderChannel,
} from "@/lib/reminders.functions";
import {
  ALL_CHANNELS,
  CHANNEL_LABELS,
  minutesToParts,
  partsToMinutes,
  type ReminderUnit,
} from "@/lib/reminder-utils";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  meeting: "Meeting",
  hearing: "Court hearing",
  deadline: "Deadline",
  call: "Call",
  internal: "Internal",
};

interface OffsetRule {
  id: string;
  value: number;
  unit: ReminderUnit;
}

interface Draft {
  offsets: OffsetRule[];
  channels: ReminderChannel[];
}

let idCounter = 0;
function makeId() {
  idCounter += 1;
  return `o${idCounter}`;
}

function TypeCard({
  eventType,
  initial,
  canEdit,
}: {
  eventType: string;
  initial: { offsets: number[]; channels: ReminderChannel[] };
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateReminderDefault);

  const baseline = useMemo<Draft>(
    () => ({
      offsets: [...initial.offsets]
        .sort((a, b) => b - a)
        .map((m) => ({ id: makeId(), ...minutesToParts(m) })),
      channels: [...initial.channels],
    }),
    [initial],
  );

  const [draft, setDraft] = useState<Draft>(baseline);
  useEffect(() => setDraft(baseline), [baseline]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          event_type: eventType,
          offsets: draft.offsets.map((o) => partsToMinutes(o.value, o.unit)),
          channels: draft.channels,
        },
      }),
    onSuccess: () => {
      toast.success(`${TYPE_LABELS[eventType] ?? eventType} reminders saved`);
      queryClient.invalidateQueries({ queryKey: ["reminder-defaults"] });
      queryClient.invalidateQueries({ queryKey: ["reminder-defaults-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function updateOffset(id: string, patch: Partial<OffsetRule>) {
    setDraft((d) => ({
      ...d,
      offsets: d.offsets.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  }
  function toggleChannel(channel: ReminderChannel) {
    setDraft((d) => ({
      ...d,
      channels: d.channels.includes(channel)
        ? d.channels.filter((c) => c !== channel)
        : [...d.channels, channel],
    }));
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">
        {TYPE_LABELS[eventType] ?? eventType}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Default reminders applied to new {TYPE_LABELS[eventType]?.toLowerCase() ?? eventType} events.
      </p>

      <div className="mt-4 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Offsets before the event
        </Label>
        {draft.offsets.length === 0 && (
          <p className="text-xs text-muted-foreground">No reminders.</p>
        )}
        {draft.offsets.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={o.value}
              disabled={!canEdit}
              onChange={(e) =>
                updateOffset(o.id, {
                  value: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-20"
            />
            <Select
              value={o.unit}
              onValueChange={(v) => updateOffset(o.id, { unit: v as ReminderUnit })}
              disabled={!canEdit}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">before</span>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    offsets: d.offsets.filter((x) => x.id !== o.id),
                  }))
                }
                aria-label="Remove offset"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                offsets: [...d.offsets, { id: makeId(), value: 1, unit: "hours" }],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add offset
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Channels
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CHANNELS.map((channel) => {
            const active = draft.channels.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                disabled={!canEdit}
                onClick={() => toggleChannel(channel)}
                className={cn(
                  "rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-ink"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {CHANNEL_LABELS[channel]}
              </button>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function ReminderDefaultsSettings() {
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "admin";
  const fetchDefaults = useServerFn(getReminderDefaults);

  const { data, isLoading } = useQuery({
    queryKey: ["reminder-defaults-settings"],
    queryFn: () => fetchDefaults(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Event reminders
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure default reminder offsets and channels per event type. New
          events inherit these and can be adjusted individually.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading defaults…</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((d) => (
          <TypeCard
            key={d.event_type}
            eventType={d.event_type}
            initial={{ offsets: d.offsets, channels: d.channels }}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  );
}
