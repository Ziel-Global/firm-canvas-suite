import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ReminderChannel } from "@/lib/reminders.functions";
import {
  ALL_CHANNELS,
  CHANNEL_LABELS,
  newRule,
  type ReminderRule,
  type ReminderUnit,
} from "@/lib/reminder-utils";

const FIELD_CLASS =
  "border-white/20 bg-black/25 shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

interface ReminderEditorProps {
  rules: ReminderRule[];
  onChange: (rules: ReminderRule[]) => void;
  disabled?: boolean;
}

export function ReminderEditor({
  rules,
  onChange,
  disabled,
}: ReminderEditorProps) {
  function update(id: string, patch: Partial<ReminderRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rules.filter((r) => r.id !== id));
  }
  function toggleChannel(id: string, channel: ReminderChannel) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    const channels = rule.channels.includes(channel)
      ? rule.channels.filter((c) => c !== channel)
      : [...rule.channels, channel];
    update(id, { channels });
  }

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No reminders. Add one below.
        </p>
      )}

      {rules.map((rule) => (
        <div
          key={rule.id}
          className="rounded-control border border-border bg-surface p-3"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={rule.value}
              disabled={disabled}
              onChange={(e) =>
                update(rule.id, { value: Math.max(1, Number(e.target.value) || 1) })
              }
              className={cn("w-20", FIELD_CLASS)}
            />
            <Select
              value={rule.unit}
              onValueChange={(v) => update(rule.id, { unit: v as ReminderUnit })}
              disabled={disabled}
            >
              <SelectTrigger className={cn("w-32", FIELD_CLASS)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">before</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8"
              disabled={disabled}
              onClick={() => remove(rule.id)}
              aria-label="Remove reminder"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL_CHANNELS.map((channel) => {
              const active = rule.channels.includes(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleChannel(rule.id, channel)}
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
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...rules, newRule()])}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" />
        Add reminder
      </Button>
    </div>
  );
}
