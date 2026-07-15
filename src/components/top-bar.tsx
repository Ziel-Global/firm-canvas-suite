import { Bell, Search } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { SmartSearchBar } from "@/components/smart-search-bar";
import { titleForPath } from "@/lib/nav";
import { NotificationsDropdown } from "@/components/notifications-dropdown";

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
        "sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-frame bg-canvas/90 px-4 py-3 backdrop-blur-sm sm:px-6",
        className,
      )}
    >
      {/* Left — section title */}
      <h1 className="shrink-0 text-lg font-semibold tracking-tight text-foreground">
        {sectionTitle}
      </h1>

      {/* Center — smart search */}
      <div className="order-last w-full min-w-0 sm:order-none sm:mx-4 sm:flex sm:max-w-md sm:flex-1 sm:justify-center">
        <SmartSearchBar />
      </div>

      {/* Right — actions */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {/* Notifications */}
        <NotificationsDropdown />

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
