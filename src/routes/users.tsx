import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, MoreHorizontal, Plus } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { NewUserSheet } from "@/components/new-user-sheet";
import { listProfiles, type ProfileRow } from "@/lib/users.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/ui/status-dot";
import type { AppRole } from "@/lib/nav";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users — Law Firm Ops" },
      { name: "description", content: "Manage firm users, roles, and access." },
    ],
  }),
  component: UsersPage,
});

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
  support: "Support",
  client: "Client",
};

const ROLE_VARIANT: Record<string, "purple" | "blue" | "sand" | "green" | "secondary"> = {
  super_admin: "purple",
  admin: "blue",
  senior_lawyer: "green",
  junior_lawyer: "sand",
  support: "secondary",
  client: "secondary",
};

const ROLE_OPTIONS: AppRole[] = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
  "client",
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UsersPage() {
  const { role } = useAuth();
  const fetchProfiles = useServerFn(listProfiles);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const isSuperAdmin = role === "super_admin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => fetchProfiles(),
    enabled: isSuperAdmin,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesRole = roleFilter === "all" || r.role === roleFilter;
      const matchesSearch =
        q === "" ||
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [data, search, roleFilter]);

  if (!isSuperAdmin) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Users</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">Users</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage everyone with access to the firm system.
      </p>

      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Loading users…
                  </TableCell>
                </TableRow>
              )}
              {error && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-destructive">
                    Could not load users.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                !error &&
                filtered.map((u: ProfileRow) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-foreground">
                      {u.full_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[u.role] ?? "secondary"}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      <StatusDot
                        status={u.is_active ? "ontrack" : "overdue"}
                        label={u.is_active ? "Active" : "Inactive"}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Row actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit user</DropdownMenuItem>
                          <DropdownMenuItem>
                            {u.is_active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </main>
  );
}
