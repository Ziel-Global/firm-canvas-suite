import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Plus, Shield, Users } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { NewUserSheet } from "@/components/new-user-sheet";
import { listProfiles, type ProfileRow } from "@/lib/users.functions";
import { Card } from "@/components/ui/card";
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
import { UserRowActions } from "@/components/user-row-actions";
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type StaffRole,
} from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "verdio" },
      {
        name: "description",
        content: "Manage firm staff users, roles, and access.",
      },
    ],
  }),
  component: UsersPage,
});

const ROLE_OPTIONS = [...STAFF_ROLES];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleTone(role: string) {
  switch (role) {
    case "super_admin":
      return "bg-white/[0.14] text-foreground border-white/15";
    case "admin":
      return "bg-white/[0.1] text-foreground border-white/12";
    case "senior_lawyer":
      return "bg-white/[0.08] text-foreground/90 border-white/10";
    case "junior_lawyer":
      return "bg-amber-500/12 text-amber-100/90 border-amber-500/20";
    default:
      return "bg-white/[0.04] text-muted-foreground border-white/[0.08]";
  }
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

  const activeCount = useMemo(
    () => (data ?? []).filter((u) => u.is_active).length,
    [data],
  );

  if (!isSuperAdmin) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Users
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">
              <Shield className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Firm · Access control
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Users
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Manage firm staff with access to this app — roles, status, and
              credentials. Clients use a separate portal and are not users here.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-4 py-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground">
                <Users className="size-4" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Directory
                </p>
                <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                  {isLoading
                    ? "Loading…"
                    : `${filtered.length} shown · ${activeCount} active`}
                </p>
              </div>
            </div>

            <Button
              onClick={() => setSheetOpen(true)}
              className="h-11 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] px-4 text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
            >
              <Plus className="size-4" />
              New user
            </Button>
          </div>
        </div>

        <NewUserSheet open={sheetOpen} onOpenChange={setSheetOpen} />

        <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />

          <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="h-10 border-white/[0.08] bg-[#17191D] pl-9 focus-visible:ring-white/10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-10 w-full border-white/[0.08] bg-[#17191D] sm:w-52">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {STAFF_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="h-11 px-5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="h-11 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Role
                  </TableHead>
                  <TableHead className="h-11 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Phone
                  </TableHead>
                  <TableHead className="h-11 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="h-11 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="h-11 w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow
                      key={`sk-${i}`}
                      className="border-white/[0.06] hover:bg-transparent"
                    >
                      <TableCell className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-9 shrink-0 rounded-xl" />
                          <Skeleton className="h-3.5 w-36" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24 rounded-md" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="size-8 rounded-lg" />
                      </TableCell>
                    </TableRow>
                  ))}
                {error && !isLoading && (
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableCell
                      colSpan={6}
                      className="py-16 text-center text-sm text-priority-high"
                    >
                      Could not load users.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableCell colSpan={6} className="py-16 text-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
                        <Users className="size-5" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-foreground">
                        No users found
                      </p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                        Adjust search or role filter, or invite someone new.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  !error &&
                  filtered.map((u: ProfileRow) => (
                    <TableRow
                      key={u.id}
                      className="border-white/[0.06] transition-colors hover:bg-white/[0.03]"
                    >
                      <TableCell className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold tracking-wide text-foreground/90">
                            {initials(u.full_name)}
                          </div>
                          <span className="font-medium tracking-tight text-foreground">
                            {u.full_name ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
                            roleTone(u.role),
                          )}
                        >
                          {STAFF_ROLE_LABELS[u.role as StaffRole] ?? u.role}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums tracking-wide text-muted-foreground">
                        {u.phone ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 text-sm">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              u.is_active
                                ? "bg-emerald-400/90 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]"
                                : "bg-priority-high/80 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]",
                            )}
                          />
                          <span
                            className={
                              u.is_active
                                ? "text-foreground/90"
                                : "text-muted-foreground"
                            }
                          >
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell>
                        <UserRowActions user={u} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </main>
  );
}
