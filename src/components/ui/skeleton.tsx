import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-white/[0.06]",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/[0.08] after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
