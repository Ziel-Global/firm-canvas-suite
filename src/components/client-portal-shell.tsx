import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="client-portal min-h-screen bg-canvas">
      <header className="client-portal__header">
        <div className="client-portal__header-inner">
          <Link to="/portal" className="client-portal__brand">
            <img
              src="/Logo.png"
              alt="Sardar Abdul Sami Associates"
              className="client-portal__logo"
              width={40}
              height={40}
            />
            <div>
              <p className="client-portal__brand-name">SAS Associates</p>
              <p className="client-portal__brand-sub">Client Portal</p>
            </div>
          </Link>

          <div className="client-portal__header-actions">
            {profile?.full_name ? (
              <span className="client-portal__user">{profile.full_name}</span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className={cn("dashboard-shell client-portal__main")}>
        <div className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-5 sm:py-8 md:px-7">{children}</div>
      </main>
    </div>
  );
}
