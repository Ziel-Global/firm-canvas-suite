import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { InvoiceDetailContent } from "@/components/invoice-detail-content";

export const Route = createFileRoute("/billing_/$invoiceId")({
  head: () => ({
    meta: [{ title: "Verdio" }],
  }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";

  if (!isAdmin) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Invoice</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <Link
        to="/billing"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to billing
      </Link>

      <div className="mx-auto mt-4 w-full max-w-3xl">
        <InvoiceDetailContent invoiceId={invoiceId} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
