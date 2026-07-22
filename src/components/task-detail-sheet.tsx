import type { ReactNode } from "react";
import { CalendarClock, FolderKanban, User } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { TaskRow, TaskStatus } from "@/lib/tasks.functions";
import { Tag } from "@/components/ui/tag";
import { AvatarStack } from "@/components/ui/avatar-stack";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(value: string | null, status: TaskStatus) {
  if (!value || status === "done") return false;
  const due = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

interface TaskDetailSheetProps {
  task: TaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailSheet({ task, open, onOpenChange }: TaskDetailSheetProps) {
  const priority = task?.priority ? PRIORITY_TAG[task.priority] : undefined;
  const overdue = task ? isOverdue(task.due_date, task.status) : false;
  const start = formatDate(task?.start_date ?? null);
  const due = formatDate(task?.due_date ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8 leading-snug">
            {task?.title ?? "Task"}
          </SheetTitle>
          <SheetDescription>
            {task ? (
              <span className="inline-flex items-center gap-2 pt-1 text-foreground">
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 rounded-full",
                    STATUS_ACCENT[task.status],
                  )}
                />
                {STATUS_LABELS[task.status]}
              </span>
            ) : (
              "Task details"
            )}
          </SheetDescription>
        </SheetHeader>

        {task ? (
          <div className="flex-1 space-y-5 overflow-y-auto py-5">
            {task.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {task.description}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description</p>
            )}

            <dl className="space-y-3 border-t border-white/[0.08] pt-4">
              <DetailRow
                icon={<User className="size-3.5" />}
                label="Assignee"
                value={
                  task.assignee_name ? (
                    <span className="inline-flex items-center gap-2">
                      <AvatarStack people={[{ name: task.assignee_name }]} />
                      <span>{task.assignee_name}</span>
                    </span>
                  ) : (
                    "Unassigned"
                  )
                }
              />

              <DetailRow
                icon={<CalendarClock className="size-3.5" />}
                label="Due date"
                value={
                  due ? (
                    <span className={cn(overdue && "font-medium text-priority-high")}>
                      {due}
                      {overdue ? " · Overdue" : ""}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />

              {start ? (
                <DetailRow
                  icon={<CalendarClock className="size-3.5" />}
                  label="Start date"
                  value={start}
                />
              ) : null}

              <DetailRow
                label="Priority"
                value={
                  priority ? (
                    <Tag color={priority.color}>{priority.label}</Tag>
                  ) : (
                    "—"
                  )
                }
              />

              {(task.case_ref || task.case_title) && task.case_id ? (
                <DetailRow
                  icon={<FolderKanban className="size-3.5" />}
                  label="Case"
                  value={
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: task.case_id }}
                      onClick={() => onOpenChange(false)}
                      className="text-tag-blue hover:underline"
                    >
                      {task.case_ref
                        ? `${task.case_ref}${task.case_title ? ` — ${task.case_title}` : ""}`
                        : task.case_title}
                    </Link>
                  }
                />
              ) : null}
            </dl>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}
