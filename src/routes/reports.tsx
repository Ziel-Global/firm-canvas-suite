import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Law Firm Ops" },
      { name: "description", content: "Reports section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Reports" />,
});
