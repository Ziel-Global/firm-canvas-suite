import { useState } from "react";
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  CheckSquare,
  FileText,
  BadgeCheck,
  Users,
  BarChart3,
  UserCog,
  Settings,
  Plus,
  Scale,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_GROUPS: { label: string; items: { title: string; icon: typeof Scale }[] }[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", icon: LayoutDashboard },
      { title: "Cases", icon: Briefcase },
      { title: "Calendar", icon: Calendar },
      { title: "Tasks", icon: CheckSquare },
      { title: "Documents", icon: FileText },
      { title: "Approvals", icon: BadgeCheck },
    ],
  },
  {
    label: "Firm",
    items: [
      { title: "Clients", icon: Users },
      { title: "Reports", icon: BarChart3 },
      { title: "Users", icon: UserCog },
      { title: "Settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const [active, setActive] = useState("Dashboard");

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-frame bg-canvas">
      {/* Logo + firm name */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-primary-ink">
          <Scale className="size-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">Marlowe &amp; Vance</span>
          <span className="text-xs text-muted-foreground">Operations</span>
        </div>
      </div>

      {/* New button */}
      <div className="px-4 pb-2">
        <Button className="w-full justify-center gap-2 font-semibold">
          <Plus className="size-4" />
          New
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = active === item.title;
                return (
                  <li key={item.title}>
                    <button
                      type="button"
                      onClick={() => setActive(item.title)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-frame text-foreground"
                          : "text-muted-foreground hover:bg-frame/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                      {item.title}
                    </button>
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
