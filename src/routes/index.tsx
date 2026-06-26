import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Tag } from "@/components/ui/tag";
import { StatusDot } from "@/components/ui/status-dot";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Style Guide — Law Firm Ops" },
      { name: "description", content: "Temporary component style guide for the design system." },
    ],
  }),
  component: StyleGuide,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">{children}</CardContent>
    </Card>
  );
}

const PEOPLE = [
  { name: "Ava Chen" },
  { name: "Marcus Lee" },
  { name: "Priya Patel" },
  { name: "Tom Reyes" },
  { name: "Nina Park" },
  { name: "Leo Diaz" },
];

function StyleGuide() {
  return (
    <div className="min-h-screen bg-canvas px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Component Style Guide</h1>
          <p className="text-sm text-muted-foreground">
            Temporary reference for the Law Firm Operations design system.
          </p>
        </header>

        <Section title="Buttons">
          <Button variant="default">Primary</Button>
          <Button variant="dark">Dark</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </Section>

        <Section title="Tags — tints">
          <Tag color="purple">Litigation</Tag>
          <Tag color="blue">Corporate</Tag>
          <Tag color="sand">Tax</Tag>
          <Tag color="green">Compliance</Tag>
        </Section>

        <Section title="Tags — priority">
          <Tag color="high">High</Tag>
          <Tag color="medium">Medium</Tag>
          <Tag color="low">Low</Tag>
        </Section>

        <Section title="Pills">
          <Pill>Draft</Pill>
          <Pill tone="outline">Filed</Pill>
          <Pill size="md">In review</Pill>
        </Section>

        <Section title="Status dots">
          <StatusDot status="ontrack" />
          <StatusDot status="atrisk" />
          <StatusDot status="overdue" />
        </Section>

        <Section title="Avatar stack">
          <AvatarStack people={PEOPLE} max={4} />
          <AvatarStack people={PEOPLE.slice(0, 3)} />
        </Section>

        <Section title="Role badges">
          <Badge variant="purple">Partner</Badge>
          <Badge variant="blue">Associate</Badge>
          <Badge variant="sand">Paralegal</Badge>
          <Badge variant="green">Client</Badge>
        </Section>

        <Section title="Card">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Acme Corp v. Globex</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                White surface, 16px radius, soft shadow on the cream canvas.
              </p>
              <div className="flex items-center gap-2">
                <Tag color="high">High</Tag>
                <StatusDot status="atrisk" />
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  );
}
