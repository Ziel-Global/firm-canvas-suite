import { Bell, Search } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { titleForPath } from "@/lib/nav";

const TEAM = [
  { name: "Ava Chen" },
  { name: "Marcus Lee" },
  { name: "Priya Patel" },
];

interface TopBarProps {
  title?: string;
  className?: string;
}

export function TopBar({ title, className }: TopBarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sectionTitle = title ?? titleForPath(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-frame bg-canvas/90 px-4 py-3 backdrop-blur-sm sm:grid sm:grid-cols-[1fr_minmax(0,28rem)_1fr] sm:flex-nowrap sm:gap-y-0 sm:px-6",
        className,
      )}
    >
      {/* Left — section title */}
      <h1 className="shrink-0 text-lg font-semibold tracking-tight text-foreground sm:col-start-1">
        {sectionTitle}
      </h1>

      {/* Center — search */}
      <div className="order-last w-full min-w-0 sm:order-none sm:col-start-2">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <input
            type="search"
            placeholder="Search cases, documents, clients"
            className="h-9 w-full rounded-control bg-frame pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-transparent transition-all focus:bg-surface focus:ring-frame focus:ring-2"
          />
        </div>
      </div>

      {/* Right — actions */}
      <div className="ml-auto flex shrink-0 items-center gap-3 sm:col-start-3 sm:ml-0 sm:justify-self-end">
        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-frame hover:text-foreground"
        >
          <Bell className="size-5" strokeWidth={1.75} />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-pill bg-priority-high ring-2 ring-canvas" />
        </button>

        {/* Avatar stack */}
        <AvatarStack people={TEAM} max={3} className="hidden sm:flex" />

        {/* Primary action */}
        <Button variant="dark" className="hidden sm:inline-flex">
          New case
        </Button>
      </div>
    </header>
  );
}
