import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  checkLockout,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/login-security.functions";
import { homePathForRole, type AppRole } from "@/lib/nav";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "verdio" },
      {
        name: "description",
        content: "Sign in to Verdio.",
      },
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

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!profile?.is_active) return;
      navigate({
        to: homePathForRole(profile.role as AppRole),
        replace: true,
      });
    })();
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

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
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

    await clearFailedLogins({ data: { email: trimmedEmail } });

    let destination: "/" | "/portal" = "/";
    const uid = signInData.user?.id;
    if (uid) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", uid)
        .maybeSingle();
      if (profile?.is_active) {
        destination = homePathForRole(profile.role as AppRole);
      } else if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        setLoading(false);
        setError("This account is inactive. Contact your firm administrator.");
        return;
      }
    }

    setLoading(false);
    navigate({ to: destination, replace: true });
  }

  return (
    <div className="auth-portal">
      <div className="auth-portal__backdrop" aria-hidden="true">
        <div className="auth-portal__spotlight" />
        <div className="auth-portal__vignette" />
        <div className="auth-portal__noise" />
      </div>

      <main className="auth-portal__main">
        <div className="auth-portal__stack">
          <img
            src="/new-logo.png"
            alt="Blackwood & Dickson LLP"
            className="auth-portal__logo auth-portal__reveal auth-portal__reveal--logo"
            width={660}
            height={198}
          />

          <header className="auth-portal__header">
            <h1 className="auth-portal__title auth-portal__reveal auth-portal__reveal--title">
              Firm Operations Portal
            </h1>
            <p className="auth-portal__subtitle auth-portal__reveal auth-portal__reveal--subtitle">
              Restricted Access &bull; Authorized Personnel Only
            </p>
          </header>

          <div className="auth-portal__card auth-portal__reveal auth-portal__reveal--card">
            <form onSubmit={handleSubmit} className="auth-portal__form">
              <div className="auth-portal__field auth-portal__reveal auth-portal__reveal--field">
                <label htmlFor="email" className="auth-portal__label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-portal__input"
                  placeholder="you@firm.com"
                />
              </div>

              <div className="auth-portal__field auth-portal__reveal auth-portal__reveal--field auth-portal__reveal--field-delay">
                <label htmlFor="password" className="auth-portal__label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-portal__input"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <div className="auth-portal__error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="auth-portal__submit auth-portal__reveal auth-portal__reveal--submit"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="auth-portal__footer">
        <p>&copy; 2026 Verdio</p>
        <p>Advocates &amp; Legal Consultants</p>
      </footer>
    </div>
  );
}
