import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, CalendarClock } from "lucide-react";

import { listTasks, type TaskRow, type TaskStatus } from "@/lib/tasks.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { AvatarStack } from "@/components/ui/avatar-stack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Law Firm Ops" },
      { name: "description", content: "Task board for the firm operations system." },
    ],
  }),
  component: TasksPage,
});

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: "todo", label: "To Do", accent: "bg-priority-low" },
  { key: "in_progress", label: "In Progress", accent: "bg-priority-med" },
  { key: "in_review", label: "In Review", accent: "bg-priority-high" },
  { key: "done", label: "Done", accent: "bg-status-ontrack" },
];

const PRIORITY_TAG: Record<string, { color: "high" | "medium" | "low"; label: string }> = {
  high: { color: "high", label: "High" },
  medium: { color: "medium", label: "Medium" },
  low: { color: "low", label: "Low" },
};

const TAG_TINTS = ["purple", "blue", "sand", "green"] as const;

function shortDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateRange(start: string | null, due: string | null) {
  const s = shortDate(start);
  const d = shortDate(due);
  if (s && d) return `${s} – ${d}`;
  if (d) return `Due ${d}`;
  if (s) return `From ${s}`;
  return null;
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const due = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function TaskCard({ task }: { task: TaskRow }) {
  const priority = task.priority ? PRIORITY_TAG[task.priority] : undefined;
  const range = dateRange(task.start_date, task.due_date);
  const overdue = isOverdue(task.due_date) && task.status !== "done";

  const tags = [task.case_type, task.case_ref].filter(Boolean) as string[];

  return (
    <Card className="cursor-pointer rounded-card border-0 bg-card p-4 shadow-[0_1px_3px_rgba(26,26,26,0.06),0_4px_12px_rgba(26,26,26,0.05)] transition-shadow hover:shadow-[0_2px_6px_rgba(26,26,26,0.08),0_8px_20px_rgba(26,26,26,0.08)]">
      <div className="flex items-start justify-between gap-2">
        {task.assignee_name ? (
          <AvatarStack people={[{ name: task.assignee_name }]} />
        ) : (
          <span className="size-8" />
        )}
        {priority ? <Tag color={priority.color}>{priority.label}</Tag> : <span />}
      </div>

      <p className="mt-3 text-sm font-semibold leading-snug text-foreground">{task.title}</p>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      ) : null}

      {tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((label, i) => (
            <Tag key={`${label}-${i}`} color={TAG_TINTS[i % TAG_TINTS.length]}>
              {label}
            </Tag>
          ))}
        </div>
      ) : null}

      {range ? (
        <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
          <CalendarClock
            className={"size-3.5 " + (overdue ? "text-priority-high" : "text-muted-foreground")}
          />
          <span
            className={
              "text-xs font-medium " +
              (overdue ? "text-priority-high" : "text-muted-foreground")
            }
          >
            {range}
          </span>
        </div>
      ) : null}
    </Card>
  );
}


function Column({
  label,
  accent,
  tasks,
}: {
  label: string;
  accent: string;
  tasks: TaskRow[];
}) {
  return (
    <div className="flex min-w-72 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={"size-2.5 rounded-pill " + accent} />
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <span className="rounded-pill bg-frame px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-control p-1 text-muted-foreground transition-colors hover:bg-frame hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Add task</DropdownMenuItem>
            <DropdownMenuItem>Sort by due date</DropdownMenuItem>
            <DropdownMenuItem>Collapse column</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 flex-col gap-3 rounded-card bg-frame/50 p-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        <button className="flex items-center justify-center gap-1.5 rounded-control border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
          <Plus className="size-3.5" />
          Add task
        </button>
      </div>
    </div>
  );
}

function TasksPage() {
  const fetchTasks = useServerFn(listTasks);
  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of data ?? []) map[t.status]?.push(t);
    return map;
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Tasks</h1>
        <p className="text-sm text-muted-foreground">Track work across every case.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : (
        <div className="flex flex-col gap-4 overflow-x-auto pb-4 lg:flex-row">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              label={col.label}
              accent={col.accent}
              tasks={grouped[col.key]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
