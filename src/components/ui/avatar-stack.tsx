import * as React from "react";

import { cn } from "@/lib/utils";

const TINTS = [
  "bg-tag-purple",
  "bg-tag-blue",
  "bg-tag-sand",
  "bg-tag-green",
] as const;

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
              "flex size-8 items-center justify-center rounded-pill text-xs font-semibold text-primary-ink ring-2 ring-card",
              TINTS[i % TINTS.length],
              i > 0 && "-ml-2",
            )}
          >
            {person.src ? (
              <img
                src={person.src}
                alt={person.name}
                className="size-full rounded-pill object-cover"
              />
            ) : (
              initials(person.name)
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="-ml-2 flex size-8 items-center justify-center rounded-pill bg-frame text-xs font-semibold text-muted-foreground ring-2 ring-card">
            +{overflow}
          </div>
        )}
      </div>
    );
  },
);
AvatarStack.displayName = "AvatarStack";

export { AvatarStack };
