import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Law Firm Ops" },
      { name: "description", content: "Operations dashboard for the firm." },
    ],
  }),
  component: () => <PlaceholderPage title="Dashboard" />,
});
