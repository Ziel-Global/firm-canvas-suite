import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SettingsSection({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  bare,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Skip the glass card wrapper around children */
  bare?: boolean;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2
            className={cn(
              "text-lg font-semibold tracking-tight text-foreground",
              eyebrow && "mt-1",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {bare ? (
        children
      ) : (
        <Card
          className={cn(
            "relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]",
            bodyClassName,
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          {children}
        </Card>
      )}
    </section>
  );
}
