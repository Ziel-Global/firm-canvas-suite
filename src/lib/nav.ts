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
  Bot,
  Library,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Cases", url: "/cases", icon: Briefcase },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      { title: "Tasks", url: "/tasks", icon: CheckSquare },
      { title: "Documents", url: "/documents", icon: FileText },
      { title: "Approvals", url: "/approvals", icon: BadgeCheck },
    ],
  },
  {
    label: "Firm",
    items: [
      { title: "Clients", url: "/clients", icon: Users },
      { title: "Reports", url: "/reports", icon: BarChart3 },
      { title: "Knowledge Base", url: "/knowledge-base", icon: Library },
      { title: "Users", url: "/users", icon: UserCog },
      { title: "Settings", url: "/settings", icon: Settings },
      { title: "AI Lab", url: "/ai-lab", icon: Bot },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export type AppRole =
  | "super_admin"
  | "admin"
  | "senior_lawyer"
  | "junior_lawyer"
  | "support"
  | "client";

// Which nav URLs each role may see.
const ROLE_NAV: Record<AppRole, string[] | "all"> = {
  super_admin: "all",
  admin: ["/", "/cases", "/calendar", "/tasks", "/documents", "/approvals", "/clients", "/reports", "/knowledge-base", "/settings"],
  senior_lawyer: ["/", "/cases", "/tasks", "/calendar", "/documents", "/knowledge-base"],
  junior_lawyer: ["/", "/cases", "/tasks", "/calendar", "/documents"],
  support: ["/", "/cases", "/tasks", "/calendar", "/documents"],
  // Clients use /portal exclusively — not listed in the internal sidebar.
  client: [],
};

export function allowedPathsForRole(role: AppRole | null | undefined): string[] {
  if (!role) return [];
  const allowed = ROLE_NAV[role];
  if (allowed === "all") return NAV_ITEMS.map((i) => i.url);
  return allowed;
}

export function navGroupsForRole(role: AppRole | null | undefined): NavGroup[] {
  const allowed = new Set(allowedPathsForRole(role));
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.url)),
  })).filter((group) => group.items.length > 0);
}

export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) =>
    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url),
  );
  return match?.title ?? "Dashboard";
}

