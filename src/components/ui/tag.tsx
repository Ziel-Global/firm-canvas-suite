import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const tagVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium leading-none text-primary-ink",
  {
    variants: {
      color: {
        purple: "bg-tag-purple",
        blue: "bg-tag-blue",
        sand: "bg-tag-sand",
        green: "bg-tag-green",
        high: "bg-priority-high text-white",
        medium: "bg-priority-med text-white",
        low: "bg-priority-low text-white",
      },
    },
    defaultVariants: {
      color: "purple",
    },
  },
);

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof tagVariants> {}

const Tag = React.forwardRef<HTMLSpanElement, TagProps>(({ className, color, ...props }, ref) => (
  <span ref={ref} className={cn(tagVariants({ color }), className)} {...props} />
));
Tag.displayName = "Tag";

export { Tag, tagVariants };
