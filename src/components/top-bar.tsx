import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SmartSearchBar } from "@/components/smart-search-bar";
import { titleForPath } from "@/lib/nav";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { useAuth } from "@/contexts/auth-context";
import { useAppSidebar } from "@/components/app-sidebar";

interface TopBarProps {
  title?: string;
  className?: string;
}

function userInitials(name: string | null | undefined, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "U";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleLabel(role: string | null) {
  if (!role) return null;
  return role.replace(/_/g, " ");
}

export function TopBar({ title, className }: TopBarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sectionTitle = title ?? titleForPath(pathname);
  const { profile, user, role } = useAuth();
  const { openMobile } = useAppSidebar();

  const displayName =
    profile?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Account";
  const initials = userInitials(profile?.full_name, user?.email);

  return (
    <header className={cn("sticky top-0 z-20", className)}>
      <div className="relative border-b border-white/[0.06] bg-[rgba(12,12,14,0.92)] supports-[backdrop-filter]:bg-[rgba(12,12,14,0.78)] supports-[backdrop-filter]:backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.04),transparent_55%)]"
        />

        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-3 px-3 py-3 sm:gap-x-4 sm:px-5 lg:px-8 xl:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none sm:gap-3">
            <button
              type="button"
              onClick={openMobile}
              aria-label="Open menu"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground lg:hidden",
                "transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              )}
            >
              <Menu className="size-[18px]" strokeWidth={1.75} />
            </button>

            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Workspace
              </p>
              <h1 className="mt-0.5 truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {sectionTitle}
              </h1>
            </div>
          </div>

          <div className="order-last w-full min-w-0 sm:order-none sm:mx-2 sm:flex sm:max-w-xl sm:flex-1 sm:justify-center lg:mx-6">
            <SmartSearchBar />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationsDropdown />

            <div
              className="hidden items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pr-3 pl-1 sm:flex"
              title={displayName}
            >
              <span className="flex size-7 items-center justify-center rounded-full border border-white/12 bg-gradient-to-b from-white/[0.16] to-white/[0.05] text-[10px] font-semibold tracking-wide text-foreground">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[9rem] truncate text-xs font-medium tracking-tight text-foreground">
                  {displayName}
                </span>
                {role ? (
                  <span className="block max-w-[9rem] truncate text-[10px] capitalize text-muted-foreground">
                    {roleLabel(role)}
                  </span>
                ) : null}
              </span>
            </div>

            {(role === "super_admin" || role === "admin") && (
              <Button
                asChild
                className="hidden h-9 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] px-3.5 text-[#1a1c20] shadow-[0_8px_18px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8] sm:inline-flex"
              >
                <Link to="/cases" search={{ new: true }}>
                  <Plus className="size-3.5" />
                  New case
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
