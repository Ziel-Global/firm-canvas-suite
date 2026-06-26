import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Law Firm Ops" },
      { name: "description", content: "Settings section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Settings" />,
});
