import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PANEL =
  "overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]";

/** Skeleton row chrome for firm tables */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <Card className={cn(PANEL, className)}>
      <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className={cn("h-2.5", i === 1 ? "w-28" : "w-16")}
          />
        ))}
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {Array.from({ length: rows }).map((_, r) => (
          <li
            key={`r-${r}`}
            className="flex items-center gap-4 px-5 py-4"
            style={{ animationDelay: `${r * 40}ms` }}
          >
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <Skeleton className="h-3.5 w-[28%]" />
              <Skeleton className="h-3 w-[14%]" />
              <Skeleton className="h-3 w-[18%]" />
              <Skeleton className="ml-auto h-3 w-[10%]" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Directory / approvals / documents list skeleton */
export function ListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <Card className={cn(PANEL, className)}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
            <Skeleton className="mt-0.5 size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-3.5 w-48 max-w-full" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
            <Skeleton className="hidden h-8 w-20 rounded-lg sm:block" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Card grid skeleton (cases cards, etc.) */
export function CardsSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card
          key={i}
          className="flex flex-col gap-4 border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-5 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-[80%]" />
              <Skeleton className="h-3 w-[55%]" />
            </div>
            <Skeleton className="size-3 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-md" />
          </div>
          <div className="mt-auto space-y-2 border-t border-white/[0.06] pt-3">
            <Skeleton className="h-3 w-[60%]" />
            <Skeleton className="h-3 w-[45%]" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Kanban board skeleton */
export function BoardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex max-w-full min-w-0 gap-4 overflow-x-auto overscroll-x-contain pb-2",
        className,
      )}
    >
      {Array.from({ length: 4 }).map((_, col) => (
        <Card
          key={col}
          className="flex w-[17.5rem] shrink-0 flex-col border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-6 rounded-md" />
          </div>
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 3 - (col % 2) }).map((_, r) => (
              <div
                key={r}
                className="space-y-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
              >
                <Skeleton className="h-3.5 w-[85%]" />
                <Skeleton className="h-2.5 w-[50%]" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-12 rounded-md" />
                  <Skeleton className="h-5 w-10 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Calendar month-ish skeleton */
export function CalendarSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn(PANEL, className)}>
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex justify-center py-3">
            <Skeleton className="h-2.5 w-8" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[88px] space-y-2 border-b border-r border-white/[0.05] p-2"
          >
            <Skeleton className="h-2.5 w-5" />
            {i % 5 === 0 ? <Skeleton className="h-6 w-full rounded-md" /> : null}
            {i % 7 === 2 ? <Skeleton className="h-6 w-[80%] rounded-md" /> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Filter bar placeholder matching glass toolbars */
export function FiltersSkeleton({ className }: { className?: string }) {
  return (
    <Card
      className={cn(
        "border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)] sm:p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-10 w-full flex-1 rounded-md" />
        <Skeleton className="h-10 w-full rounded-md sm:w-40" />
        <Skeleton className="h-10 w-full rounded-md sm:w-36" />
      </div>
    </Card>
  );
}

/** Compact inline loader for sheets / dropdowns */
export function InlineLoaderSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === 0 ? "w-[70%]" : i === 1 ? "w-full" : "w-[55%]")}
        />
      ))}
    </div>
  );
}
