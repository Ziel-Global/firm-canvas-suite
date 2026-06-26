import { createFileRoute } from "@tanstack/react-router";

import { ReminderDefaultsSettings } from "@/components/reminder-defaults-settings";
import { MorningDigestPreview } from "@/components/morning-digest-preview";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Law Firm Ops" },
      {
        name: "description",
        content: "Settings section for the firm operations system.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Firm-wide configuration.
        </p>
      </div>
      <ReminderDefaultsSettings />
      <MorningDigestPreview />
    </div>
  );
}
