import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Law Firm Ops" },
      { name: "description", content: "Calendar section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Calendar" />,
});
