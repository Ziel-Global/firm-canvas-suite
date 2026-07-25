import { CalendarClock } from "lucide-react";

import type { TaskRow, TaskStatus } from "@/lib/tasks.functions";
import { Tag } from "@/components/ui/tag";
import { AvatarStack } from "@/components/ui/avatar-stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo: "bg-priority-low",
  in_progress: "bg-priority-med",
  in_review: "bg-priority-high",
  done: "bg-status-ontrack",
};

const PRIORITY_TAG: Record<string, { color: "high" | "medium" | "low"; label: string }> = {
  high: { color: "high", label: "High" },
  medium: { color: "medium", label: "Medium" },
  low: { color: "low", label: "Low" },
};

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

interface TaskListViewProps {
  tasks: TaskRow[];
  /** Hide the case column when already scoped to a single case. */
  showCase?: boolean;
  onSelect?: (task: TaskRow) => void;
}

export function TaskListView({
  tasks,
  showCase = true,
  onSelect,
}: TaskListViewProps) {
  if (!tasks.length) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-14 text-center">
        <p className="text-sm font-medium text-foreground">No tasks to show</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust filters or add a new task to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="h-11 bg-white/[0.02] text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Task
            </TableHead>
            <TableHead className="h-11 bg-white/[0.02] text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Status
            </TableHead>
            {showCase ? (
              <TableHead className="h-11 bg-white/[0.02] text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Case
              </TableHead>
            ) : null}
            <TableHead className="h-11 bg-white/[0.02] text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Assignee
            </TableHead>
            <TableHead className="h-11 bg-white/[0.02] text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Priority
            </TableHead>
            <TableHead className="h-11 bg-white/[0.02] text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Dates
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const priority = task.priority ? PRIORITY_TAG[task.priority] : undefined;
            const range = dateRange(task.start_date, task.due_date);
            const overdue = isOverdue(task.due_date) && task.status !== "done";
            return (
              <TableRow
                key={task.id}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(task) : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(task);
                        }
                      }
                    : undefined
                }
                className={
                  "border-white/[0.06] transition-colors hover:bg-white/[0.03]" +
                  (onSelect ? " cursor-pointer" : "")
                }
              >
                <TableCell className="max-w-[280px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium tracking-tight text-foreground">{task.title}</p>
                    {task.stage_id ? <Tag color="sand">Stage</Tag> : null}
                  </div>
                  {task.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {task.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2 text-sm text-foreground">
                    <span
                      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_ACCENT[task.status]}`}
                    />
                    {STATUS_LABELS[task.status]}
                  </span>
                </TableCell>
                {showCase ? (
                  <TableCell className="text-sm text-muted-foreground">
                    {task.case_ref ?? task.case_title ?? "—"}
                  </TableCell>
                ) : null}
                <TableCell>
                  {task.assignee_name ? (
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <AvatarStack people={[{ name: task.assignee_name }]} />
                      <span className="truncate">{task.assignee_name}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  {priority ? <Tag color={priority.color}>{priority.label}</Tag> : "—"}
                </TableCell>
                <TableCell>
                  {range ? (
                    <span
                      className={
                        "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums " +
                        (overdue ? "text-priority-high" : "text-muted-foreground")
                      }
                    >
                      <CalendarClock className="size-3.5" />
                      {range}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
