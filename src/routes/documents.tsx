import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Law Firm Ops" },
      { name: "description", content: "Documents section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Documents" />,
});
