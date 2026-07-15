import { useIsFetching, useIsMutating } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

/**
 * Thin top progress indicator for any in-flight React Query
 * fetch or mutation across the authenticated app shell.
 */
export function GlobalLoadingBar({ className }: { className?: string }) {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full origin-left bg-gradient-to-r from-transparent via-white to-white/40 transition-opacity duration-300",
          active ? "opacity-100 animate-[load-bar_1.1s_ease-in-out_infinite]" : "opacity-0",
        )}
      />
    </div>
  );
}
