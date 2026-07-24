import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar, AppSidebarProvider, AppMain } from "@/components/app-sidebar";
import { GlobalLoadingBar } from "@/components/global-loading-bar";
import { PremiumLoaderPanel } from "@/components/premium-loader";
import { TopBar } from "@/components/top-bar";
import { AuthProvider } from "@/contexts/auth-context";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  pendingComponent: () => (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-[1440px] pt-10">
        <PremiumLoaderPanel label="Loading page…" />
      </div>
    </main>
  ),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Verdio" },
      {
        name: "description",
        content: "Verdio — law firm operations management.",
      },
      { name: "author", content: "Verdio" },
      { property: "og:title", content: "Verdio" },
      {
        property: "og:description",
        content: "Verdio — law firm operations management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Verdio" },
      {
        name: "twitter:description",
        content: "Verdio — law firm operations management.",
      },
    ],
    links: [
      { rel: "icon", href: "/favicon-32.png?v=11", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16.png?v=11", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon.ico?v=11", sizes: "any" },
      { rel: "shortcut icon", href: "/favicon-32.png?v=11", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=11", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "only dark" }}>
      <head>
        <HeadContent />
        <meta name="color-scheme" content="only dark" />
        <meta name="theme-color" content="#1a1d24" />
      </head>
      <body className="dark" style={{ colorScheme: "only dark" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname === "/auth" || pathname === "/bootstrap";
  const isPortalRoute = pathname === "/portal" || pathname.startsWith("/portal/");

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      // Clear on session switch so React Query never briefly serves the
      // previous user's cached tasks/dashboard (invalidate keeps old data
      // visible while refetching). Same-user profile updates only invalidate.
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        queryClient.clear();
      } else {
        queryClient.invalidateQueries();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isAuthRoute || isPortalRoute ? (
          <>
            {!isAuthRoute ? <GlobalLoadingBar /> : null}
            <Outlet />
          </>
        ) : (
          <AppSidebarProvider>
            <div className="min-h-screen min-w-0 max-w-[100vw] overflow-x-hidden bg-canvas">
              <GlobalLoadingBar />
              <AppSidebar />
              <AppMain>
                <TopBar />
                {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
                <Outlet />
              </AppMain>
            </div>
          </AppSidebarProvider>
        )}
        <Toaster richColors position="top-right" closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
