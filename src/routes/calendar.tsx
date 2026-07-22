import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

import {
  listCalendarEvents,
  type CalendarEvent,
} from "@/lib/calendar.functions";
import { cn } from "@/lib/utils";
import { CalendarSkeleton } from "@/components/loading-skeletons";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NewEventSheet } from "@/components/new-event-sheet";
import { EventDetailSheet } from "@/components/event-detail-sheet";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — SAS Associates" },
      {
        name: "description",
        content: "Firm calendar with day, week, and month views.",
      },
    ],
  }),
  component: CalendarPage,
});

type ViewMode = "day" | "week" | "month";

const HOUR_START = 7;
const HOUR_END = 21;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => HOUR_START + i,
);

const TYPE_STYLES: Record<string, string> = {
  meeting: "bg-white/[0.06] border-l-white/50",
  hearing: "bg-priority-high/15 border-l-priority-high",
  deadline: "bg-priority-high/12 border-l-priority-high/80",
  call: "bg-white/[0.05] border-l-white/35",
  internal: "bg-white/[0.04] border-l-white/25",
};

function typeStyle(type: string | null) {
  return TYPE_STYLES[type ?? "meeting"] ?? "bg-white/[0.04] border-l-white/30";
}

function rangeFor(view: ViewMode, anchor: Date) {
  if (view === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (view === "week")
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  return {
    from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
    to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
  };
}

function CalendarPage() {
  const fetchEvents = useServerFn(listCalendarEvents);
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  function openEventDetail(event: CalendarEvent) {
    setSelectedEvent(event);
    setDetailOpen(true);
  }

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: [
      "calendar-events",
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    queryFn: () =>
      fetchEvents({
        data: { from: range.from.toISOString(), to: range.to.toISOString() },
      }),
  });

  const events = useMemo(
    () =>
      isSuperAdmin && !showPrivate
        ? allEvents.filter((e) => !e.is_private)
        : allEvents,
    [allEvents, isSuperAdmin, showPrivate],
  );

  function shift(dir: number) {
    if (view === "day") setAnchor((d) => addDays(d, dir));
    else if (view === "week") setAnchor((d) => addWeeks(d, dir));
    else setAnchor((d) => addMonths(d, dir));
  }

  const heading =
    view === "month"
      ? format(anchor, "MMMM yyyy")
      : view === "week"
        ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
        : format(anchor, "EEEE, MMMM d, yyyy");

  const privateCount = useMemo(
    () => allEvents.filter((e) => e.is_private).length,
    [allEvents],
  );

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Calendar
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hearings, deadlines, and firm commitments
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isSuperAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPrivate((s) => !s)}
                className={cn(
                  "gap-1.5 border border-white/[0.08] bg-white/[0.03]",
                  showPrivate
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {showPrivate ? (
                  <Eye className="size-3.5" />
                ) : (
                  <EyeOff className="size-3.5" />
                )}
                Private layer
                {privateCount > 0 && (
                  <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums">
                    {privateCount}
                  </span>
                )}
              </Button>
            )}
            <Button
              onClick={() => setSheetOpen(true)}
              className="gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
            >
              <Plus className="size-4" />
              New event
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => shift(-1)}
                className="size-9 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAnchor(new Date())}
                className="h-9 border border-white/[0.08] bg-white/[0.03] px-3 hover:bg-white/[0.06]"
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => shift(1)}
                className="size-9 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
              >
                <ChevronRight className="size-4" />
              </Button>
              <span className="ml-2 text-sm font-semibold tracking-tight text-foreground">
                {heading}
              </span>
            </div>

            <div className="inline-flex rounded-xl border border-white/[0.08] bg-[#17191D] p-1">
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
                    view === v
                      ? "bg-white/[0.1] text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {isLoading ? (
          <CalendarSkeleton />
        ) : view === "month" ? (
          <MonthView anchor={anchor} events={events} onSelect={openEventDetail} />
        ) : view === "week" ? (
          <WeekView range={range} events={events} onSelect={openEventDetail} />
        ) : (
          <DayView anchor={anchor} events={events} onSelect={openEventDetail} />
        )}

        <NewEventSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          defaultDate={anchor}
        />
        <EventDetailSheet
          event={selectedEvent}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setSelectedEvent(null);
          }}
        />
      </div>
    </main>
  );
}

function eventTime(e: CalendarEvent) {
  return e.starts_at ? format(new Date(e.starts_at), "h:mm a") : "";
}

function DayView({
  anchor,
  events,
  onSelect,
}: {
  anchor: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const dayEvents = events.filter(
    (e) => e.starts_at && isSameDay(new Date(e.starts_at), anchor),
  );

  return (
    <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
      {HOURS.map((hour) => {
        const slotEvents = dayEvents.filter(
          (e) => e.starts_at && new Date(e.starts_at).getHours() === hour,
        );
        return (
          <div
            key={hour}
            className="grid grid-cols-[4.5rem_1fr] border-b border-white/[0.06] last:border-b-0"
          >
            <div className="px-3 py-3.5 text-right text-[11px] tabular-nums text-muted-foreground">
              {format(new Date().setHours(hour, 0, 0, 0), "h a")}
            </div>
            <div className="min-h-[3.25rem] space-y-2 border-l border-white/[0.06] p-2">
              {slotEvents.map((e) => (
                <EventBlock key={e.id} event={e} detailed onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function WeekView({
  range,
  events,
  onSelect,
}: {
  range: { from: Date; to: Date };
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {days.map((day) => {
        const dayEvents = events
          .filter((e) => e.starts_at && isSameDay(new Date(e.starts_at), day))
          .sort((a, b) => (a.starts_at! < b.starts_at! ? -1 : 1));
        const isToday = isSameDay(day, new Date());
        return (
          <Card
            key={day.toISOString()}
            className={cn(
              "min-h-[12rem] border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-2.5 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.5)] transition-colors",
              isToday && "border-white/20 ring-1 ring-white/10",
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  isToday
                    ? "bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20]"
                    : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="space-y-1.5">
              {dayEvents.length === 0 ? (
                <p className="px-1 py-6 text-center text-[11px] text-muted-foreground/50">
                  No events
                </p>
              ) : (
                dayEvents.map((e) => (
                  <EventBlock key={e.id} event={e} onSelect={onSelect} />
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function MonthView({
  anchor,
  events,
  onSelect,
}: {
  anchor: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
      <div className="grid grid-cols-7 border-b border-white/[0.06] bg-white/[0.02]">
        {weekdays.map((d) => (
          <div
            key={d}
            className="px-2 py-2.5 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, anchor);
          const isToday = isSameDay(day, new Date());
          const dayEvents = events.filter(
            (e) => e.starts_at && isSameDay(new Date(e.starts_at), day),
          );
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[6.5rem] border-b border-r border-white/[0.05] p-1.5",
                !inMonth && "bg-black/20",
              )}
            >
              <div className="mb-1.5 flex justify-end">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isToday
                      ? "bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20]"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelect(e)}
                    className={cn(
                      "block w-full truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] text-foreground/90 transition-colors hover:bg-white/[0.06]",
                      typeStyle(e.event_type),
                    )}
                    title={e.title ?? ""}
                  >
                    {eventTime(e)} {e.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EventBlock({
  event,
  detailed = false,
  onSelect,
}: {
  event: CalendarEvent;
  detailed?: boolean;
  onSelect: (event: CalendarEvent) => void;
}) {
  const end = event.ends_at ? format(new Date(event.ends_at), "h:mm a") : "";
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={cn(
        "w-full rounded-lg border-l-2 px-2 py-1.5 text-left text-foreground transition-colors hover:bg-white/[0.04]",
        typeStyle(event.event_type),
      )}
    >
      <p className="flex items-center gap-1 truncate text-sm font-medium">
        {event.is_private && (
          <Lock className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{event.title}</span>
      </p>
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {eventTime(event)}
        {end && ` – ${end}`}
      </p>
      {detailed && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {event.case_ref && <span>{event.case_ref}</span>}
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {event.location}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
