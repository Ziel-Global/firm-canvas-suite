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

  // Redirect unauthenticated users (and client-role users) away from internal app.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.has(pathname);

    if (!session && !isPublic) {
      navigate({ to: "/auth", replace: true });
      return;
    }

    // The client role may never enter the internal app.
    if (session && profile && (profile.role === "client" || !profile.is_active) && !isPublic) {
      void signOut().then(() => navigate({ to: "/auth", replace: true }));
    }
  }, [loading, session, profile, pathname, navigate, signOut]);

  // Inactivity-based auto sign-out using firm_settings.session_timeout_minutes.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timeoutMs = DEFAULT_TIMEOUT_MINUTES * 60 * 1000;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void signOut().then(() => navigate({ to: "/auth", replace: true }));
      }, timeoutMs);
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

    async function setup() {
      const { data } = await supabase
        .from("firm_settings")
        .select("value")
        .eq("key", "session_timeout_minutes")
        .maybeSingle();
      if (cancelled) return;
      const minutes = Number(data?.value);
      if (Number.isFinite(minutes) && minutes > 0) {
        timeoutMs = minutes * 60 * 1000;
      }
      events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
      resetTimer();
    }

    setup();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [session, navigate, signOut]);

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
