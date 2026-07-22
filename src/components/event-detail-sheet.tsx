import type { ReactNode } from "react";
import { format } from "date-fns";
import { CalendarClock, FolderKanban, Lock, MapPin, Tag } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { CalendarEvent } from "@/lib/calendar.functions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: "Meeting",
  hearing: "Court hearing",
  deadline: "Deadline",
  call: "Call",
  internal: "Internal",
};

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailSheet({
  event,
  open,
  onOpenChange,
}: EventDetailSheetProps) {
  const typeLabel = event?.event_type
    ? EVENT_TYPE_LABELS[event.event_type] ?? event.event_type
    : null;

  const dateLabel = event?.starts_at
    ? format(new Date(event.starts_at), "EEEE, MMM d, yyyy")
    : null;

  const timeLabel = formatTimeRange(event?.starts_at ?? null, event?.ends_at ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8 leading-snug">
            {event?.title ?? "Event"}
          </SheetTitle>
          <SheetDescription>
            {typeLabel ? (
              <span className="inline-flex items-center gap-1.5 pt-1 text-foreground">
                {event?.is_private ? (
                  <Lock className="size-3.5 text-muted-foreground" />
                ) : null}
                {typeLabel}
                {event?.is_private ? " · Private" : ""}
              </span>
            ) : (
              "Event details"
            )}
          </SheetDescription>
        </SheetHeader>

        {event ? (
          <div className="flex-1 space-y-5 overflow-y-auto py-5">
            {event.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {event.description}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description</p>
            )}

            <dl className="space-y-3 border-t border-white/[0.08] pt-4">
              <DetailRow
                icon={<CalendarClock className="size-3.5" />}
                label="Date"
                value={dateLabel ?? "—"}
              />

              <DetailRow
                icon={<CalendarClock className="size-3.5" />}
                label="Time"
                value={timeLabel ?? "—"}
              />

              {event.location ? (
                <DetailRow
                  icon={<MapPin className="size-3.5" />}
                  label="Location"
                  value={event.location}
                />
              ) : null}

              {typeLabel ? (
                <DetailRow
                  icon={<Tag className="size-3.5" />}
                  label="Type"
                  value={typeLabel}
                />
              ) : null}

              {event.case_id ? (
                <DetailRow
                  icon={<FolderKanban className="size-3.5" />}
                  label="Case"
                  value={
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: event.case_id }}
                      onClick={() => onOpenChange(false)}
                      className="text-tag-blue hover:underline"
                    >
                      {event.case_ref ?? "Open case"}
                    </Link>
                  }
                />
              ) : null}
            </dl>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function formatTimeRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) return null;
  const start = format(new Date(startsAt), "h:mm a");
  if (!endsAt) return start;
  return `${start} – ${format(new Date(endsAt), "h:mm a")}`;
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}
