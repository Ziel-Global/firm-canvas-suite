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
import { ChevronLeft, ChevronRight, Plus, MapPin } from "lucide-react";

import {
  listCalendarEvents,
  type CalendarEvent,
} from "@/lib/calendar.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NewEventSheet } from "@/components/new-event-sheet";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Law Firm Ops" },
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
  meeting: "bg-tag-blue/40 border-l-priority-med",
  hearing: "bg-priority-high/20 border-l-priority-high",
  deadline: "bg-priority-high/20 border-l-priority-high",
  call: "bg-tag-green/40 border-l-status-ontrack",
  internal: "bg-tag-purple/40 border-l-tag-purple",
};

function typeStyle(type: string | null) {
  return TYPE_STYLES[type ?? "meeting"] ?? "bg-frame border-l-muted";
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
  const [showPrivate, setShowPrivate] = useState(true);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

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

  // Super Admin can overlay or hide his private layer. Other roles never
  // receive private events from RLS, so this only affects the super_admin view.
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Day, week, and month views of firm commitments.
          </p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          New event
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-foreground">
            {heading}
          </span>
        </div>

        <div className="inline-flex rounded-control border border-border bg-card p-0.5">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-[10px] px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                view === v
                  ? "bg-surface-dark text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading calendar…</p>
      ) : view === "month" ? (
        <MonthView anchor={anchor} events={events} />
      ) : view === "week" ? (
        <WeekView range={range} events={events} />
      ) : (
        <DayView anchor={anchor} events={events} />
      )}

      <NewEventSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultDate={anchor}
      />
    </div>
  );
}

function eventTime(e: CalendarEvent) {
  return e.starts_at ? format(new Date(e.starts_at), "h:mm a") : "";
}

/* ---------------- Day view: time-blocked schedule ---------------- */
function DayView({
  anchor,
  events,
}: {
  anchor: Date;
  events: CalendarEvent[];
}) {
  const dayEvents = events.filter(
    (e) => e.starts_at && isSameDay(new Date(e.starts_at), anchor),
  );

  return (
    <div className="rounded-card border border-border bg-card">
      {HOURS.map((hour) => {
        const slotEvents = dayEvents.filter(
          (e) => e.starts_at && new Date(e.starts_at).getHours() === hour,
        );
        return (
          <div
            key={hour}
            className="grid grid-cols-[64px_1fr] border-b border-border/60 last:border-b-0"
          >
            <div className="px-3 py-3 text-right text-xs text-muted-foreground">
              {format(new Date().setHours(hour, 0, 0, 0), "h a")}
            </div>
            <div className="space-y-2 border-l border-border/60 p-2">
              {slotEvents.map((e) => (
                <EventBlock key={e.id} event={e} detailed />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Week view ---------------- */
function WeekView({
  range,
  events,
}: {
  range: { from: Date; to: Date };
  events: CalendarEvent[];
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
          <div
            key={day.toISOString()}
            className="rounded-card border border-border bg-card p-2"
          >
            <div className="mb-2 flex items-baseline justify-between px-1">
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-pill text-sm font-semibold",
                  isToday
                    ? "bg-primary text-primary-ink"
                    : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="space-y-1.5">
              {dayEvents.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground/60">
                  —
                </p>
              ) : (
                dayEvents.map((e) => <EventBlock key={e.id} event={e} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Month view ---------------- */
function MonthView({
  anchor,
  events,
}: {
  anchor: Date;
  events: CalendarEvent[];
}) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-medium uppercase text-muted-foreground"
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
                "min-h-24 border-b border-r border-border/60 p-1.5",
                !inMonth && "bg-frame/40",
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-pill text-xs font-semibold",
                    isToday
                      ? "bg-primary text-primary-ink"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "truncate rounded-control border-l-2 px-1.5 py-0.5 text-[11px] text-foreground",
                      typeStyle(e.event_type),
                    )}
                    title={e.title ?? ""}
                  >
                    {eventTime(e)} {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventBlock({
  event,
  detailed = false,
}: {
  event: CalendarEvent;
  detailed?: boolean;
}) {
  const end = event.ends_at ? format(new Date(event.ends_at), "h:mm a") : "";
  return (
    <div
      className={cn(
        "rounded-control border-l-2 px-2 py-1.5 text-foreground",
        typeStyle(event.event_type),
      )}
    >
      <p className="truncate text-sm font-medium">{event.title}</p>
      <p className="text-xs text-muted-foreground">
        {eventTime(event)}
        {end && ` – ${end}`}
      </p>
      {detailed && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {event.case_ref && <span>{event.case_ref}</span>}
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {event.location}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
