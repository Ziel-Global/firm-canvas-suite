import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Plus, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { navGroupsForRole } from "@/lib/nav";
import { useAuth } from "@/contexts/auth-context";

const STORAGE_KEY = "sas-sidebar-collapsed";

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useAppSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useAppSidebar must be used within AppSidebarProvider");
  }
  return ctx;
}

export function AppSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsedState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggle, setCollapsed }),
    [collapsed, toggle, setCollapsed],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, signOut } = useAuth();
  const { collapsed, toggle } = useAppSidebar();
  const navGroups = navGroupsForRole(role);

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/[0.08]",
        "bg-[rgba(12,12,14,0.92)] backdrop-blur-xl",
        "shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)]",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-[4.25rem]" : "w-16 lg:w-64",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_30%_0%,rgba(255,255,255,0.06),transparent_70%)]"
      />

      {/* Brand row: logo + name, then hamburger on the right */}
      <div
        className={cn(
          "relative flex items-center gap-2 px-3 py-4",
          collapsed ? "flex-col gap-3 px-2" : "justify-between lg:gap-2",
        )}
      >
        {!collapsed ? (
          <div className="hidden min-w-0 flex-1 items-center gap-2.5 lg:flex">
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden">
              <img
                src="/transparent-law-logo-mark.png"
                alt="SAS Associates"
                className="size-9 object-contain brightness-110 contrast-125"
              />
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                SAS Associates
              </span>
              <span className="text-[11px] text-muted-foreground">
                Operations
              </span>
            </div>
          </div>
        ) : (
          <div className="flex size-8 items-center justify-center overflow-hidden">
            <img
              src="/transparent-law-logo-mark.png"
              alt="SAS Associates"
              className="size-8 object-contain brightness-110 contrast-125"
            />
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground",
            "transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            !collapsed && "ml-auto lg:ml-0",
          )}
        >
          <Menu className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      {/* New */}
      <div className={cn("relative px-3 pb-3", collapsed && "px-2")}>
        <Button
          title="New"
          className={cn(
            "w-full gap-2 font-semibold",
            collapsed
              ? "justify-center px-0"
              : "justify-center lg:justify-start",
            "border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20]",
            "shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]",
          )}
        >
          <Plus className="size-4 shrink-0" />
          <span className={cn(collapsed ? "sr-only" : "hidden lg:inline")}>
            New
          </span>
        </Button>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "relative flex-1 overflow-y-auto overflow-x-hidden py-2",
          collapsed ? "px-1.5" : "px-2 lg:px-3",
        )}
      >
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p
              className={cn(
                "px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
                collapsed ? "sr-only" : "hidden lg:block",
              )}
            >
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item.url);
                return (
                  <li key={item.title}>
                    <Link
                      to={item.url}
                      title={item.title}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        collapsed
                          ? "justify-center px-0"
                          : "justify-center lg:justify-start",
                        active
                          ? "bg-white/[0.1] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-[18px] shrink-0 transition-colors",
                          active && "text-foreground",
                        )}
                        strokeWidth={1.75}
                      />
                      <span
                        className={cn(
                          "truncate",
                          collapsed ? "sr-only" : "hidden lg:inline",
                        )}
                      >
                        {item.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div
        className={cn(
          "relative border-t border-white/[0.06] p-3",
          collapsed && "px-2",
        )}
      >
        <button
          type="button"
          onClick={() => void signOut()}
          title="Sign out"
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
            "hover:bg-priority-high/10 hover:text-priority-high",
            collapsed ? "justify-center px-0" : "justify-center lg:justify-start",
          )}
        >
          <LogOut className="size-[18px] shrink-0" strokeWidth={1.75} />
          <span className={cn(collapsed ? "sr-only" : "hidden lg:inline")}>
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}

/** Main column that shifts with the sidebar width */
export function AppMain({ children }: { children: ReactNode }) {
  const { collapsed } = useAppSidebar();

  return (
    <div
      className={cn(
        "min-h-screen transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "pl-[4.25rem]" : "pl-16 lg:pl-64",
      )}
    >
      {children}
    </div>
  );
}
