import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { homePathForRole, type AppRole } from "@/lib/nav";
import { verifyAccess } from "@/lib/access-guard.functions";
import { SESSION_TIMEOUT_CHANGED_EVENT } from "@/lib/firm-settings-events";

interface Profile {
  id: string;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  two_factor_enabled: boolean;
  phone: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Routes that don't require authentication.
const PUBLIC_PATHS = new Set(["/auth", "/bootstrap"]);

function isPortalPath(pathname: string) {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

const DEFAULT_TIMEOUT_MINUTES = 30;

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks which user's profile is loaded so focus-driven auth events
  // (TOKEN_REFRESHED etc.) don't re-fetch and re-render needlessly.
  const profileUidRef = useRef<string | null>(null);

  const signOut = useMemo(
    () => async () => {
      await supabase.auth.signOut();
      profileUidRef.current = null;
      setSession(null);
      setUser(null);
      setProfile(null);
    },
    [],
  );

  const refreshProfile = useMemo(
    () => async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) {
        setProfile(null);
        return;
      }
      const { data: row } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active, two_factor_enabled, phone")
        .eq("id", uid)
        .maybeSingle();
      setProfile((row as Profile | null) ?? null);
    },
    [],
  );

  // Load session + profile and subscribe to auth changes.
  useEffect(() => {
    let active = true;

    async function loadProfile(uid: string) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active, two_factor_enabled, phone")
        .eq("id", uid)
        .maybeSingle();
      return data as Profile | null;
    }

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        const p = await loadProfile(data.session.user.id);
        if (active) {
          profileUidRef.current = data.session.user.id;
          setProfile(p);
        }
      }
      if (active) setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Supabase fires TOKEN_REFRESHED / SIGNED_IN every time the tab regains
      // focus. Skip no-op updates so the whole app doesn't re-render (and
      // effects don't re-run) when nothing meaningful changed.
      setSession((prev) =>
        prev?.access_token === newSession?.access_token ? prev : newSession,
      );
      setUser((prev) => {
        const nextUser = newSession?.user ?? null;
        return prev?.id === nextUser?.id ? prev : nextUser;
      });
      if (newSession?.user) {
        const uid = newSession.user.id;
        // Only re-fetch the profile when the signed-in user actually changed.
        if (profileUidRef.current !== uid) {
          profileUidRef.current = uid;
          loadProfile(uid).then((p) => {
            if (active) setProfile(p);
          });
        }
      } else {
        profileUidRef.current = null;
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Redirect: unauthenticated → /auth; signed-in users leave /auth for their
  // role home; clients → /portal only; staff stay on the ops app.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.has(pathname);
    const onPortal = isPortalPath(pathname);

    if (!session && !isPublic) {
      // Avoid bouncing a just-signed-in user back to /auth while React state
      // catches up with the Supabase session.
      let cancelled = false;
      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (!data.session) {
          navigate({ to: "/auth", replace: true });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (!session || !profile) return;

    if (!profile.is_active) {
      if (!isPublic) {
        void signOut().then(() => navigate({ to: "/auth", replace: true }));
      }
      return;
    }

    const home = homePathForRole(profile.role);

    // Leave the sign-in screen once we know who they are.
    // Keep /bootstrap reachable for one-time setup even while signed in.
    if (pathname === "/auth") {
      navigate({ to: home, replace: true });
      return;
    }

    if (profile.role === "client") {
      // Clients only use the portal — never the internal app shell.
      if (!onPortal) {
        navigate({ to: "/portal", replace: true });
      }
      return;
    }

    // Staff who land on the portal are sent to their ops dashboard.
    if (onPortal) {
      navigate({ to: home, replace: true });
    }
  }, [loading, session, profile, pathname, navigate, signOut]);

  // Live revocation: verify on the server (RLS-scoped) that the user is still
  // active on every navigation and on a short interval. If deactivated (or an
  // override removed access), sign them out immediately. RLS already blocks the
  // data on the next request — this just ends the stale session.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const check = async () => {
      // Don't check while the tab is hidden: browsers throttle timers in
      // background tabs, so the access token may be expired until Supabase
      // refreshes it on focus. Checking then would fail spuriously.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        // getSession() refreshes an expired token first, so the server call
        // below never runs with a stale token after returning to the tab.
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) return; // redirect effect handles missing sessions

        const result = await verifyAccess();
        // Only an explicit "revoked" answer ends the session. Transient
        // network/server errors must NOT log the user out — RLS already
        // blocks all data for a genuinely revoked session.
        if (!cancelled && result && result.active === false) {
          await signOut();
          navigate({ to: "/auth", replace: true });
        }
      } catch {
        // Network hiccup or in-flight token refresh — try again next tick.
      }
    };

    void check();
    const interval = setInterval(check, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, pathname, navigate, signOut]);



  // Inactivity-based auto sign-out using firm_settings.session_timeout_minutes.
  // Re-reads on navigation and applies live updates when Settings are saved.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMsRef = useRef(DEFAULT_TIMEOUT_MINUTES * 60 * 1000);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void signOut().then(() => navigate({ to: "/auth", replace: true }));
      }, timeoutMsRef.current);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    const onActivity = () => resetTimer();

    async function loadTimeout() {
      const { data } = await supabase
        .from("firm_settings")
        .select("value")
        .eq("key", "session_timeout_minutes")
        .maybeSingle();
      if (cancelled) return;
      const minutes = Number(data?.value);
      if (Number.isFinite(minutes) && minutes > 0) {
        timeoutMsRef.current = minutes * 60 * 1000;
      } else {
        timeoutMsRef.current = DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
      }
      resetTimer();
    }

    const onSettingChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ minutes?: number }>).detail;
      const minutes = Number(detail?.minutes);
      if (Number.isFinite(minutes) && minutes > 0) {
        timeoutMsRef.current = minutes * 60 * 1000;
        resetTimer();
      } else {
        void loadTimeout();
      }
    };

    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    window.addEventListener(SESSION_TIMEOUT_CHANGED_EVENT, onSettingChanged);
    void loadTimeout();

    // Pick up remote changes even if this tab didn't save them.
    const poll = window.setInterval(() => {
      void loadTimeout();
    }, 60_000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.clearInterval(poll);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener(SESSION_TIMEOUT_CHANGED_EVENT, onSettingChanged);
    };
  }, [session, pathname, navigate, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      role: profile?.role ?? null,
      loading,
      signOut,
      refreshProfile,
    }),
    [user, session, profile, loading, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
