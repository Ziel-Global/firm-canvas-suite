import { cn } from "@/lib/utils";

type LoaderSize = "sm" | "md" | "lg";

const SIZE: Record<LoaderSize, { wrap: string; ring: string }> = {
  sm: { wrap: "size-5", ring: "border-[1.5px]" },
  md: { wrap: "size-8", ring: "border-2" },
  lg: { wrap: "size-11", ring: "border-2" },
};

/**
 * Premium spinner — silver orbit that fits the firm dark UI.
 * Use for buttons, sheets, and compact inline waits.
 * Prefer skeleton surfaces for tables/lists while page data loads.
 */
export function PremiumLoader({
  size = "md",
  className,
  label,
}: {
  size?: LoaderSize;
  className?: string;
  label?: string;
}) {
  const s = SIZE[size];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
      className={cn(
        "inline-flex items-center",
        label ? "flex-col gap-3" : null,
        className,
      )}
    >
      <span className={cn("relative inline-flex", s.wrap)}>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full border-white/[0.08]",
            s.ring,
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 animate-[loader-orbit_0.85s_cubic-bezier(0.4,0,0.2,1)_infinite] rounded-full border-transparent border-t-white/85 border-r-white/35",
            s.ring,
          )}
        />
        <span
          aria-hidden
          className="absolute inset-[28%] rounded-full bg-white/[0.12] shadow-[0_0_12px_rgba(255,255,255,0.12)]"
        />
      </span>
      {label ? (
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

/** Centered panel for page / section loading waits */
export function PremiumLoaderPanel({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-16 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,255,255,0.05),transparent_55%)]"
      />
      <PremiumLoader size="lg" label={label} className="relative" />
    </div>
  );
}
