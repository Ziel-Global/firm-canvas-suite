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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card bg-surface p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text">Marlowe &amp; Vance</h1>
          <p className="mt-1 text-sm text-muted">Operations Management — Staff sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
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
              className="w-full rounded-control border border-frame bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="you@firm.com"
            />
          </div>

          <div className="space-y-1.5">
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
              className="w-full rounded-control border border-frame bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-control bg-status-overdue/10 px-3 py-2 text-sm text-status-overdue"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
