import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const dotVariants = cva("inline-block size-2 shrink-0 rounded-pill", {
  variants: {
    status: {
      ontrack: "bg-status-ontrack",
      atrisk: "bg-status-atrisk",
      overdue: "bg-status-overdue",
    },
  },
  defaultVariants: {
    status: "ontrack",
  },
});

const STATUS_LABELS: Record<NonNullable<VariantProps<typeof dotVariants>["status"]>, string> = {
  ontrack: "On track",
  atrisk: "At risk",
  overdue: "Overdue",
};

export interface StatusDotProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof dotVariants> {
  label?: string;
}

const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, status, label, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("inline-flex items-center gap-2 text-sm text-foreground", className)}
      {...props}
    >
      <span className={dotVariants({ status })} />
      {label ?? STATUS_LABELS[status ?? "ontrack"]}
    </span>
  ),
);
StatusDot.displayName = "StatusDot";

export { StatusDot, dotVariants };
