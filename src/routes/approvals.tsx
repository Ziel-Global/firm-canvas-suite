import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Law Firm Ops" },
      { name: "description", content: "Approvals section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Approvals" />,
});
