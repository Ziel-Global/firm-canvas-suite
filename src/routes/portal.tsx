import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";

import { ClientPortalShell } from "@/components/client-portal-shell";
import { PremiumLoaderPanel } from "@/components/premium-loader";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Verdio" },
      {
        name: "description",
        content: "View your case status, shared documents, and upcoming hearings.",
      },
    ],
  }),
  component: PortalLayout,
});

function PortalLayout() {
  const { loading, session, profile, role } = useAuth();

  if (loading) {
    return (
      <main className="dashboard-shell min-h-screen px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <PremiumLoaderPanel label="Opening portal…" />
        </div>
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (profile && role !== "client") {
    return <Navigate to="/" replace />;
  }

  if (profile && !profile.is_active) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <ClientPortalShell>
      <Outlet />
    </ClientPortalShell>
  );
}
