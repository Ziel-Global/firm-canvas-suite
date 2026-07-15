import * as React from "react";

import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export interface AvatarStackProps extends React.HTMLAttributes<HTMLDivElement> {
  people: { name: string; src?: string }[];
  max?: number;
}

const AvatarStack = React.forwardRef<HTMLDivElement, AvatarStackProps>(
  ({ className, people, max = 4, ...props }, ref) => {
    const visible = people.slice(0, max);
    const overflow = people.length - visible.length;

    return (
      <div ref={ref} className={cn("flex items-center", className)} {...props}>
        {visible.map((person, i) => (
          <div
            key={`${person.name}-${i}`}
            title={person.name}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide text-foreground/90",
              "border border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.04]",
              "ring-2 ring-[rgba(12,12,14,0.95)]",
              i > 0 && "-ml-2",
            )}
          >
            {person.src ? (
              <img
                src={person.src}
                alt={person.name}
                className="size-full rounded-full object-cover"
              />
            ) : (
              initials(person.name)
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="-ml-2 flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold text-muted-foreground ring-2 ring-[rgba(12,12,14,0.95)]">
            +{overflow}
          </div>
        )}
      </div>
    );
  },
);
AvatarStack.displayName = "AvatarStack";

export { AvatarStack };
