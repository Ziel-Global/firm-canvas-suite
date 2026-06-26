import type { ReminderChannel } from "@/lib/reminders.functions";

export type ReminderUnit = "minutes" | "hours" | "days";

export interface ReminderRule {
  id: string;
  value: number;
  unit: ReminderUnit;
  channels: ReminderChannel[];
}

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  email: "Email",
  sms: "SMS",
  in_app: "In-app",
};

export const ALL_CHANNELS: ReminderChannel[] = ["email", "sms", "in_app"];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `r${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function minutesToParts(minutes: number): {
  value: number;
  unit: ReminderUnit;
} {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

export function partsToMinutes(value: number, unit: ReminderUnit): number {
  if (unit === "days") return value * 1440;
  if (unit === "hours") return value * 60;
  return value;
}

export function formatOffset(minutes: number): string {
  const { value, unit } = minutesToParts(minutes);
  const label = value === 1 ? unit.slice(0, -1) : unit;
  return `${value} ${label} before`;
}

/** Build editable rules from a list of offsets (minutes) sharing the same channel set. */
export function offsetsToRules(
  offsets: number[],
  channels: ReminderChannel[],
): ReminderRule[] {
  return [...offsets]
    .sort((a, b) => b - a)
    .map((m) => ({ id: nextId(), ...minutesToParts(m), channels: [...channels] }));
}

/** Build editable rules from per-event reminder rows (offset + channel pairs). */
export function eventRemindersToRules(
  rows: { offset_minutes: number; channel: ReminderChannel }[],
): ReminderRule[] {
  const byOffset = new Map<number, ReminderChannel[]>();
  for (const r of rows) {
    const list = byOffset.get(r.offset_minutes) ?? [];
    if (!list.includes(r.channel)) list.push(r.channel);
    byOffset.set(r.offset_minutes, list);
  }
  return [...byOffset.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([m, channels]) => ({ id: nextId(), ...minutesToParts(m), channels }));
}

/** Flatten rules to the {offset_minutes, channel} rows stored in event_reminders. */
export function rulesToEventReminders(
  rules: ReminderRule[],
): { offset_minutes: number; channel: ReminderChannel }[] {
  const out: { offset_minutes: number; channel: ReminderChannel }[] = [];
  for (const rule of rules) {
    const minutes = partsToMinutes(rule.value, rule.unit);
    if (minutes <= 0) continue;
    for (const channel of rule.channels) {
      out.push({ offset_minutes: minutes, channel });
    }
  }
  return out;
}

export function newRule(): ReminderRule {
  return { id: nextId(), value: 1, unit: "hours", channels: ["email", "in_app"] };
}

export const DEFAULT_OFFSETS = [10080, 1440, 120];
