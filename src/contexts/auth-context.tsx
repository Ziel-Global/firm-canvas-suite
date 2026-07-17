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
import type { AppRole } from "@/lib/nav";
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

  const signOut = useMemo(
    () => async () => {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
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
        if (active) setProfile(p);
      }
      if (active) setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        loadProfile(newSession.user.id).then((p) => {
          if (active) setProfile(p);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Redirect: unauthenticated → /auth; clients → /portal only; staff stay internal.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.has(pathname);
    const onPortal = isPortalPath(pathname);

    if (!session && !isPublic) {
      navigate({ to: "/auth", replace: true });
      return;
    }

    if (!session || !profile) return;

    if (!profile.is_active && !isPublic) {
      void signOut().then(() => navigate({ to: "/auth", replace: true }));
      return;
    }

    if (profile.role === "client") {
      // Clients only use the portal — never the internal app shell.
      if (!onPortal && !isPublic) {
        navigate({ to: "/portal", replace: true });
      }
      return;
    }

    // Staff who land on the portal are sent back to the ops app.
    if (onPortal) {
      navigate({ to: "/", replace: true });
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
      try {
        const result = await verifyAccess();
        if (!cancelled && result && result.active === false) {
          await signOut();
          navigate({ to: "/auth", replace: true });
        }
      } catch {
        // A failed/unauthorized check means the session is no longer valid.
        if (!cancelled) {
          await signOut();
          navigate({ to: "/auth", replace: true });
        }
      }
    };

    void check();
    const interval = setInterval(check, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
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
    }),
    [user, session, profile, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
