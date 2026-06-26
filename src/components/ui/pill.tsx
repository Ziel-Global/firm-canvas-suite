import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill font-medium leading-none transition-colors",
  {
    variants: {
      size: {
        sm: "px-2.5 py-1 text-xs",
        md: "px-3 py-1.5 text-sm",
      },
      tone: {
        neutral: "bg-frame text-foreground",
        outline: "border border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      size: "sm",
      tone: "neutral",
    },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, size, tone, ...props }, ref) => (
    <span ref={ref} className={cn(pillVariants({ size, tone }), className)} {...props} />
  ),
);
Pill.displayName = "Pill";

export { Pill, pillVariants };
