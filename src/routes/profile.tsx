import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Lock, Mail, Phone, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { PremiumLoaderPanel } from "@/components/premium-loader";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — SAS Associates" },
      {
        name: "description",
        content: "View and update your personal account details.",
      },
    ],
  }),
  component: ProfilePage,
});

const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] px-4 text-sm font-semibold text-[#1a1c20] shadow-[0_8px_18px_rgba(0,0,0,0.22)] transition hover:from-white hover:to-[#d8d8d8] disabled:pointer-events-none disabled:opacity-50";

const BTN_SOFT =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-sm font-medium text-foreground/80 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

function monogram(name: string | null, email: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "U";
  const first = source.split(/\s+/).filter(Boolean)[0] ?? "U";
  return first.slice(0, 1).toUpperCase();
}

function roleLabel(role: string) {
  if (role in STAFF_ROLE_LABELS) {
    return STAFF_ROLE_LABELS[role as StaffRole];
  }
  return role.replace(/_/g, " ");
}

function formatMemberSince(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Field({
  id,
  label,
  hint,
  icon,
  className,
  ...props
}: ComponentProps<"input"> & {
  label: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="profile-label">
        {label}
      </Label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute top-1/2 left-3.5 z-[1] -translate-y-1/2 text-white/35 [&_svg]:size-3.5">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          className={cn("profile-field", icon && "profile-field--icon")}
          {...props}
        />
      </div>
      {hint ? <p className="text-[11px] leading-relaxed text-white/35">{hint}</p> : null}
    </div>
  );
}

function ProfilePage() {
  const { refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!data) return;
    setFullName(data.fullName ?? "");
    setPhone(data.phone ?? "");
  }, [data]);

  const profileMutation = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          fullName: fullName.trim(),
          phone: phone.trim(),
        },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["my-profile"], updated);
      await refreshProfile();
      toast.success("Profile updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (authError) throw new Error(authError.message);
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty =
    data != null &&
    (fullName.trim() !== (data.fullName ?? "").trim() ||
      phone.trim() !== (data.phone ?? "").trim());

  if (isLoading) {
    return (
      <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[880px] space-y-5 pt-2">
          <Skeleton className="h-36 w-full rounded-[1.5rem]" />
          <Skeleton className="h-72 w-full rounded-[1.5rem]" />
          <PremiumLoaderPanel label="Loading profile…" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-5 py-6">
          <h1 className="text-lg font-semibold text-foreground">
            Couldn’t load profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Your profile could not be loaded. Try refreshing the page."}
          </p>
        </div>
      </main>
    );
  }

  const mark = monogram(data.fullName, data.email);
  const displayName = data.fullName?.trim() || "Unnamed user";

  return (
    <main className="profile-page dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 pb-14">
        {/* Page intro */}
        <header className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1">
            <UserRound className="size-3 text-white/40" strokeWidth={1.75} />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
              Account
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            Profile
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/45">
            Your name, contact details, and sign-in password for this workspace.
          </p>
        </header>

        {/* Identity */}
        <section className="profile-card relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(255,255,255,0.06),transparent_50%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />

          <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-7">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <div
                aria-hidden
                className="profile-monogram"
                title={displayName}
              >
                <span className="profile-monogram__letter">{mark}</span>
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {displayName}
                </h2>
                <p className="mt-0.5 truncate text-sm text-white/45">
                  {data.email ?? "No email on file"}
                </p>
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/40">
                  <span className="font-medium text-white/70">
                    {roleLabel(data.role)}
                  </span>
                  <span aria-hidden className="text-white/20">
                    ·
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      data.isActive ? "text-emerald-400/90" : "text-rose-400/90",
                    )}
                  >
                    {data.isActive ? "Active" : "Inactive"}
                  </span>
                  <span aria-hidden className="text-white/20">
                    ·
                  </span>
                  <span>Since {formatMemberSince(data.createdAt)}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Personal details */}
        <section className="profile-card p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="profile-section-icon">
              <UserRound className="size-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Personal details
              </h2>
              <p className="mt-0.5 text-sm text-white/40">
                How your name and phone appear across the firm workspace.
              </p>
            </div>
          </div>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              profileMutation.mutate();
            }}
          >
            <Field
              id="profile-name"
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              required
              autoComplete="name"
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-email"
                label="Email"
                value={data.email ?? ""}
                readOnly
                tabIndex={-1}
                icon={<Mail strokeWidth={1.75} />}
                hint="Managed by firm administrators."
              />
              <Field
                id="profile-phone"
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 …"
                autoComplete="tel"
                icon={<Phone strokeWidth={1.75} />}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5">
              <button
                type="submit"
                disabled={!dirty || profileMutation.isPending}
                className={BTN_PRIMARY}
              >
                <Save className="size-3.5" strokeWidth={2} />
                {profileMutation.isPending ? "Saving…" : "Save changes"}
              </button>
              {dirty ? (
                <button
                  type="button"
                  className={BTN_SOFT}
                  disabled={profileMutation.isPending}
                  onClick={() => {
                    setFullName(data.fullName ?? "");
                    setPhone(data.phone ?? "");
                  }}
                >
                  Discard
                </button>
              ) : null}
            </div>
          </form>
        </section>

        {/* Security */}
        <section className="profile-card p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="profile-section-icon">
              <Lock className="size-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Password
              </h2>
              <p className="mt-0.5 text-sm text-white/40">
                Set a new sign-in password. Minimum 8 characters.
              </p>
            </div>
          </div>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              passwordMutation.mutate();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-password"
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                icon={<KeyRound strokeWidth={1.75} />}
              />
              <Field
                id="profile-password-confirm"
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                minLength={8}
                icon={<KeyRound strokeWidth={1.75} />}
              />
            </div>

            <div className="border-t border-white/[0.06] pt-5">
              <button
                type="submit"
                disabled={
                  passwordMutation.isPending ||
                  !newPassword ||
                  !confirmPassword
                }
                className={BTN_PRIMARY}
              >
                <KeyRound className="size-3.5" strokeWidth={2} />
                {passwordMutation.isPending
                  ? "Updating…"
                  : "Update password"}
              </button>
            </div>
          </form>
        </section>

        <p className="px-1 text-center text-[11px] text-white/30">
          Role ({roleLabel(data.role)}) is assigned by administrators and can’t
          be changed here.
        </p>
      </div>
    </main>
  );
}
