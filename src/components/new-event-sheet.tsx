import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createCalendarEvent,
  getCalendarOptions,
} from "@/lib/calendar.functions";
import { getReminderDefaults } from "@/lib/reminders.functions";
import {
  offsetsToRules,
  rulesToEventReminders,
  type ReminderRule,
} from "@/lib/reminder-utils";
import { ReminderEditor } from "@/components/reminder-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/mic-button";
import { CleanupButton } from "@/components/cleanup-button";
import { Switch } from "@/components/ui/switch";
import { DarkDatePicker } from "@/components/dark-date-picker";
import { useAuth } from "@/contexts/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const FIELD_CLASS =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

const NO_CASE = "__none__";
const EVENT_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "hearing", label: "Court hearing" },
  { value: "deadline", label: "Deadline" },
  { value: "call", label: "Call" },
  { value: "internal", label: "Internal" },
];

interface NewEventSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultCaseId?: string | null;
  lockCase?: boolean;
}

function combine(date: Date | undefined, time: string): string | null {
  if (!date) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

export function NewEventSheet({
  open,
  onOpenChange,
  defaultDate,
  defaultCaseId,
  lockCase,
}: NewEventSheetProps) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const fetchOptions = useServerFn(getCalendarOptions);
  const fetchDefaults = useServerFn(getReminderDefaults);
  const create = useServerFn(createCalendarEvent);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState<string>(defaultCaseId ?? NO_CASE);
  const [eventType, setEventType] = useState("meeting");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isPrivate, setIsPrivate] = useState(false);
  const [reminders, setReminders] = useState<ReminderRule[]>([]);
  const [remindersTouched, setRemindersTouched] = useState(false);

  const { data: cases } = useQuery({
    queryKey: ["calendar-options"],
    queryFn: () => fetchOptions(),
    enabled: open,
  });

  const { data: reminderDefaults } = useQuery({
    queryKey: ["reminder-defaults"],
    queryFn: () => fetchDefaults(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCaseId(defaultCaseId ?? NO_CASE);
    if (defaultDate) setDate(defaultDate);
  }, [open, defaultCaseId, defaultDate]);

  // Pre-fill reminders from the selected event type's defaults until the user edits them.
  useEffect(() => {
    if (!open || remindersTouched || !reminderDefaults) return;
    const def = reminderDefaults.find((d) => d.event_type === eventType);
    setReminders(
      def ? offsetsToRules(def.offsets, def.channels) : [],
    );
  }, [open, eventType, reminderDefaults, remindersTouched]);

  function handleReminders(next: ReminderRule[]) {
    setRemindersTouched(true);
    setReminders(next);
  }

  function reset() {
    setTitle("");
    setDescription("");
    setCaseId(defaultCaseId ?? NO_CASE);
    setEventType("meeting");
    setLocation("");
    setDate(defaultDate);
    setStartTime("09:00");
    setEndTime("10:00");
    setIsPrivate(false);
    setReminders([]);
    setRemindersTouched(false);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const starts_at = combine(date, startTime);
      const ends_at = combine(date, endTime);
      if (!title.trim()) throw new Error("Title is required.");
      if (!starts_at || !ends_at) throw new Error("Pick a date and times.");
      if (ends_at <= starts_at)
        throw new Error("End time must be after the start time.");
      if (eventType === "hearing" && caseId === NO_CASE) {
        throw new Error("Court hearings must be linked to a case.");
      }
      return create({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          case_id: caseId === NO_CASE ? null : caseId,
          event_type: eventType,
          location: location.trim() || null,
          starts_at,
          ends_at,
          is_private: eventType === "hearing" ? false : isPrivate,
          reminders: rulesToEventReminders(reminders),
        },
      });
    },
    onSuccess: (created) => {
      const isHearing = created.event_type === "hearing";
      toast.success(
        isHearing
          ? "Hearing created — visible on this case and in the client portal"
          : "Event created",
      );
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const lockedCaseLabel = (() => {
    const match = (cases ?? []).find((c) => c.id === caseId);
    if (!match) return "This case";
    return `${match.case_ref} — ${match.title ?? "Untitled"}`;
  })();

  const caseRequiredForHearing = eventType === "hearing";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New event</SheetTitle>
          <SheetDescription>
            {lockCase
              ? "Add a commitment to this case calendar. Court hearings also appear in the client portal."
              : "Add a commitment to the firm calendar. Court hearings linked to a case appear in the client portal."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Client strategy meeting"
              className={FIELD_CLASS}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <DarkDatePicker
              value={date}
              onChange={setDate}
              className={`w-full ${FIELD_CLASS}`}
              placeholder="Pick the day"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-start">Start</Label>
              <Input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end">End</Label>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={eventType}
              onValueChange={(value) => {
                setEventType(value);
                if (value === "hearing") setIsPrivate(false);
              }}
            >
              <SelectTrigger className={FIELD_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eventType === "hearing" && (
              <p className="text-xs text-muted-foreground">
                Visible to the case client in their portal.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              Case
              {lockCase || caseRequiredForHearing ? "" : " (optional)"}
              {caseRequiredForHearing && !lockCase ? " (required)" : ""}
            </Label>
            {lockCase ? (
              <Input
                readOnly
                value={lockedCaseLabel}
                className={`${FIELD_CLASS} text-muted-foreground`}
                tabIndex={-1}
              />
            ) : (
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger className={FIELD_CLASS}>
                  <SelectValue
                    placeholder={
                      caseRequiredForHearing ? "Select a case" : "No case"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {caseRequiredForHearing ? (
                    caseId === NO_CASE && (
                      <SelectItem value={NO_CASE} disabled>
                        Select a case
                      </SelectItem>
                    )
                  ) : (
                    <SelectItem value={NO_CASE}>No case</SelectItem>
                  )}
                  {(cases ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.case_ref} — {c.title ?? "Untitled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room 4 / Zoom"
              className={FIELD_CLASS}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-desc">Notes</Label>
            <div className="relative">
              <Textarea
                id="event-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`pr-[4.5rem] ${FIELD_CLASS}`}
              />
              <div className="absolute right-2 top-2 flex items-center gap-0.5">
                <CleanupButton
                  text={description}
                  onCleaned={setDescription}
                />
                <MicButton
                  onTranscript={(text) => setDescription(prev => prev ? prev + " " + text : text)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <Label>Reminders</Label>
              <p className="text-xs text-muted-foreground">
                Pre-filled from the {eventType} defaults. Adjust offsets and
                channels for this event.
              </p>
            </div>
            <ReminderEditor rules={reminders} onChange={handleReminders} />
          </div>



          {isSuperAdmin && eventType !== "hearing" && (
            <div className="flex items-center justify-between rounded-control border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Principal-private
                </p>
                <p className="text-xs text-muted-foreground">
                  Only you can see this event.
                </p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Create event"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
