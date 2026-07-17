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
import { Menu, Plus, LogOut, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { navGroupsForRole } from "@/lib/nav";
import { useAuth } from "@/contexts/auth-context";

const STORAGE_KEY = "sas-sidebar-collapsed";

type SidebarContextValue = {
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsedState(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Close the drawer on navigation (phones).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

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

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);

  const value = useMemo(
    () => ({
      collapsed,
      mobileOpen,
      toggle,
      setCollapsed,
      openMobile,
      closeMobile,
      toggleMobile,
    }),
    [
      collapsed,
      mobileOpen,
      toggle,
      setCollapsed,
      openMobile,
      closeMobile,
      toggleMobile,
    ],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, signOut } = useAuth();
  const { collapsed, toggle, mobileOpen, closeMobile } = useAppSidebar();
  const navGroups = navGroupsForRole(role);

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <>
      {/* Scrim — phones only */}
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={closeMobile}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 lg:hidden",
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        data-collapsed={collapsed ? "true" : "false"}
        data-mobile-open={mobileOpen ? "true" : "false"}
        className={cn(
          // Pin with dvh — avoids Android Chromium “fixed scrolls with page”
          // when backdrop-filter / background-attachment:fixed fight the compositor.
          "app-sidebar fixed top-0 left-0 z-50 flex flex-col",
          "h-dvh max-h-dvh w-[min(18rem,88vw)] border-r border-white/[0.08]",
          "bg-[#0c0c0e] shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)]",
          "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          // Mobile: off-canvas drawer
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible rail; width depends on collapse
          "lg:translate-x-0 lg:transition-[width] lg:duration-300",
          collapsed ? "lg:w-[4.25rem]" : "lg:w-64",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_30%_0%,rgba(255,255,255,0.06),transparent_70%)]"
        />

        {/* Brand row */}
        <div
          className={cn(
            "relative flex items-center gap-2 px-3 py-4",
            collapsed ? "lg:flex-col lg:gap-3 lg:px-2" : "justify-between",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5",
              collapsed && "lg:flex-none lg:justify-center",
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center">
              <img
                src="/onlylogo.png"
                alt="Firm logo"
                className="size-10 scale-[2.75] object-contain"
              />
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-col leading-tight",
                collapsed && "lg:hidden",
              )}
            >
              <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              Blackwood & Nelson
              </span>
              <span className="text-[11px] text-muted-foreground">
                Operations
              </span>
            </div>
          </div>

          {/* Close on phone; collapse toggle on desktop */}
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close menu"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground lg:hidden",
              "transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            )}
          >
            <X className="size-[18px]" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "hidden size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground lg:flex",
              "transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            )}
          >
            <Menu className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        {/* New */}
        <div className={cn("relative px-3 pb-3", collapsed && "lg:px-2")}>
          <Button
            title="New"
            className={cn(
              "w-full gap-2 font-semibold",
              collapsed ? "lg:justify-center lg:px-0" : "justify-start",
              "border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20]",
              "shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]",
            )}
          >
            <Plus className="size-4 shrink-0" />
            <span className={cn(collapsed && "lg:sr-only")}>New</span>
          </Button>
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-2",
            collapsed ? "px-2 lg:px-1.5" : "px-3",
          )}
        >
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <p
                className={cn(
                  "px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
                  collapsed && "lg:sr-only",
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
                        onClick={closeMobile}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                          collapsed
                            ? "lg:justify-center lg:px-0"
                            : "justify-start",
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
                            collapsed && "lg:sr-only",
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
            collapsed && "lg:px-2",
          )}
        >
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors",
              "hover:bg-priority-high/10 hover:text-priority-high",
              collapsed ? "lg:justify-center lg:px-0" : "justify-start",
            )}
          >
            <LogOut className="size-[18px] shrink-0" strokeWidth={1.75} />
            <span className={cn(collapsed && "lg:sr-only")}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/** Main column that shifts with the sidebar width on desktop only */
export function AppMain({ children }: { children: ReactNode }) {
  const { collapsed } = useAppSidebar();

  return (
    <div
      className={cn(
        "min-h-dvh min-w-0 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        // Phones: full width (drawer overlays). Desktop: leave room for rail.
        collapsed ? "lg:pl-[4.25rem]" : "lg:pl-64",
      )}
    >
      {children}
    </div>
  );
}
