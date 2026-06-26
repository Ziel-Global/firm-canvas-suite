import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users — Law Firm Ops" },
      { name: "description", content: "Users section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Users" />,
});
