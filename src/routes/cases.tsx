import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/cases")({
  head: () => ({
    meta: [
      { title: "Cases — Law Firm Ops" },
      { name: "description", content: "Cases section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Cases" />,
});
