import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Law Firm Ops" },
      { name: "description", content: "Clients section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Clients" />,
});
