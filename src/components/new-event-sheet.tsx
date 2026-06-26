import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createCalendarEvent,
  getCalendarOptions,
} from "@/lib/calendar.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}: NewEventSheetProps) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const fetchOptions = useServerFn(getCalendarOptions);
  const create = useServerFn(createCalendarEvent);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState<string>(NO_CASE);
  const [eventType, setEventType] = useState("meeting");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isPrivate, setIsPrivate] = useState(false);

  const { data: cases } = useQuery({
    queryKey: ["calendar-options"],
    queryFn: () => fetchOptions(),
    enabled: open,
  });

  function reset() {
    setTitle("");
    setDescription("");
    setCaseId(NO_CASE);
    setEventType("meeting");
    setLocation("");
    setDate(defaultDate);
    setStartTime("09:00");
    setEndTime("10:00");
    setIsPrivate(false);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const starts_at = combine(date, startTime);
      const ends_at = combine(date, endTime);
      if (!title.trim()) throw new Error("Title is required.");
      if (!starts_at || !ends_at) throw new Error("Pick a date and times.");
      if (ends_at <= starts_at)
        throw new Error("End time must be after the start time.");
      return create({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          case_id: caseId === NO_CASE ? null : caseId,
          event_type: eventType,
          location: location.trim() || null,
          starts_at,
          ends_at,
          is_private: isPrivate,
        },
      });
    },
    onSuccess: () => {
      toast.success("Event created");
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New event</SheetTitle>
          <SheetDescription>
            Add a commitment to the firm calendar.
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
            />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <DarkDatePicker
              value={date}
              onChange={setDate}
              className="w-full"
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
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end">End</Label>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
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
          </div>

          <div className="space-y-1.5">
            <Label>Case (optional)</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="No case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE}>No case</SelectItem>
                {(cases ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.case_ref} — {c.title ?? "Untitled"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room 4 / Zoom"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-desc">Notes</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {isSuperAdmin && (
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
