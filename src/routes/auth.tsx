import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  checkLockout,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/login-security.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Marlowe & Vance" },
      { name: "description", content: "Secure staff sign in for the firm operations system." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already signed in, go straight to the dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  function formatCooldown(seconds: number) {
    const minutes = Math.ceil(seconds / 60);
    return minutes <= 1 ? "a minute" : `${minutes} minutes`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();

    // 1. Refuse if the account is currently locked out.
    const lock = await checkLockout({ data: { email: trimmedEmail } });
    if (lock.locked) {
      setLoading(false);
      setError(
        `Too many failed attempts. This account is locked. Try again in ${formatCooldown(
          lock.retryAfterSeconds,
        )}.`,
      );
      return;
    }

    // 2. Attempt sign in (session lands in the browser).
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      // 3. Record the failure; lock the account once the limit is reached.
      const outcome = await recordFailedLogin({ data: { email: trimmedEmail } });
      setLoading(false);
      if (outcome.locked) {
        setError(
          `Too many failed attempts. This account is now locked. Try again in ${formatCooldown(
            outcome.retryAfterSeconds,
          )}.`,
        );
      } else if (outcome.attemptsRemaining <= 2) {
        setError(
          `Incorrect email or password. ${outcome.attemptsRemaining} attempt${
            outcome.attemptsRemaining === 1 ? "" : "s"
          } remaining before lockout.`,
        );
      } else {
        setError("Incorrect email or password. Please try again.");
      }
      return;
    }

    // 4. Success — clear the failure counter.
    await clearFailedLogins({ data: { email: trimmedEmail } });
    setLoading(false);
    navigate({ to: "/", replace: true });
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 relative overflow-hidden">
      {/* Decorative ambient lighting elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-primary/20 rounded-full blur-[100px] -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-secondary/20 rounded-full blur-[100px] -z-10 animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="w-full max-w-md p-8 glass-card">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight gradient-text pb-1">Marlowe &amp; Vance</h1>
          <p className="mt-2 text-sm text-text-secondary">Operations Management — Staff sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-text">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-control border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none transition-all duration-200 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 shadow-inner"
              placeholder="you@firm.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-text">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-control border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none transition-all duration-200 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 shadow-inner"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-control bg-status-overdue/10 border border-status-overdue/20 p-3 shadow-sm animate-in fade-in slide-in-from-top-1">
              <p role="alert" className="text-sm text-status-overdue text-center">
                {error}
              </p>
            </div>
          )}

          <Button type="submit" className="w-full btn-premium py-5 mt-2" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
