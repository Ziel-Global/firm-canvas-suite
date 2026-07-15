import { createFileRoute } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";

import { ReminderDefaultsSettings } from "@/components/reminder-defaults-settings";
import { MorningDigestPreview } from "@/components/morning-digest-preview";
import { WorkflowTemplatesSettings } from "@/components/workflow-templates-settings";
import { DelegationSettings } from "@/components/delegation-settings";
import { DocumentTemplatesSettings } from "@/components/document-templates-settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SAS Associates" },
      {
        name: "description",
        content: "Firm-wide configuration for the operations system.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <main className="dashboard-shell min-h-[calc(100vh-3.5rem)] px-5 py-6 sm:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">
              <SlidersHorizontal className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Firm · Configuration
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Settings
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Approvals, templates, workflows, and delivery defaults that shape
              day-to-day operations across the firm.
            </p>
          </div>
        </div>

        <DelegationSettings />
        <DocumentTemplatesSettings />
        <WorkflowTemplatesSettings />
        <ReminderDefaultsSettings />
        <MorningDigestPreview />
      </div>
    </main>
  );
}
