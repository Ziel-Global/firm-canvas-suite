import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Law Firm Ops" },
      { name: "description", content: "Tasks section for the firm operations system." },
    ],
  }),
  component: () => <PlaceholderPage title="Tasks" />,
});
