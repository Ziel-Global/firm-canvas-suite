import { Link, useRouterState } from "@tanstack/react-router";
import { Plus, Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { navGroupsForRole } from "@/lib/nav";
import { useAuth } from "@/contexts/auth-context";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useAuth();
  const navGroups = navGroupsForRole(role);


  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-frame bg-canvas lg:w-64">
      {/* Logo + firm name */}
      <div className="flex items-center gap-3 px-3 py-5 lg:px-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-primary-ink">
          <Scale className="size-5" />
        </div>
        <div className="hidden flex-col leading-tight lg:flex">
          <span className="text-sm font-semibold text-foreground">Marlowe &amp; Vance</span>
          <span className="text-xs text-muted-foreground">Operations</span>
        </div>
      </div>

      {/* New button */}
      <div className="px-3 pb-2 lg:px-4">
        <Button className="w-full justify-center gap-2 font-semibold">
          <Plus className="size-4" />
          <span className="hidden lg:inline">New</span>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 lg:px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="hidden px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:block">
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
                        "flex w-full items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors justify-center lg:justify-start",
                        active
                          ? "bg-frame text-foreground"
                          : "text-muted-foreground hover:bg-frame/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                      <span className="hidden lg:inline">{item.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
