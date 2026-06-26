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
      { title: "Users", url: "/users", icon: UserCog },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) =>
    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url),
  );
  return match?.title ?? "Dashboard";
}
