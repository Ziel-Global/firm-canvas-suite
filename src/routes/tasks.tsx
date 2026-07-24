import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, CalendarClock, CalendarRange, X, LayoutGrid, List } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import {
  listTasks,
  reorderTasks,
  type TaskRow,
  type TaskStatus,
  type TaskOrderInput,
} from "@/lib/tasks.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewTaskSheet } from "@/components/new-task-sheet";
import { TaskDetailSheet } from "@/components/task-detail-sheet";
import { TaskListView } from "@/components/task-list-view";
import { Tag } from "@/components/ui/tag";
import { AvatarStack } from "@/components/ui/avatar-stack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BoardSkeleton, ListSkeleton } from "@/components/loading-skeletons";
import { useAppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — SAS Associates" },
      { name: "description", content: "Task board for the firm operations system." },
    ],
  }),
  component: TasksPage,
});

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: "todo", label: "To Do", accent: "bg-white/60" },
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

type Board = Record<TaskStatus, TaskRow[]>;

function emptyBoard(): Board {
  return { todo: [], in_progress: [], in_review: [], done: [] };
}

function groupTasks(tasks: TaskRow[]): Board {
  const board = emptyBoard();
  for (const t of tasks) board[t.status]?.push(t);
  return board;
}

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

function TaskCardBody({ task }: { task: TaskRow }) {
  const priority = task.priority ? PRIORITY_TAG[task.priority] : undefined;
  const range = dateRange(task.start_date, task.due_date);
  const overdue = isOverdue(task.due_date) && task.status !== "done";
  const tags = [task.case_type, task.case_ref].filter(Boolean) as string[];

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {task.assignee_name ? (
          <AvatarStack people={[{ name: task.assignee_name }]} />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] text-muted-foreground">
            —
          </span>
        )}
        {priority ? <Tag color={priority.color}>{priority.label}</Tag> : <span />}
      </div>

      <p className="mt-3 text-sm font-semibold leading-snug tracking-tight text-foreground">
        {task.title}
      </p>
      {task.description ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </p>
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
        <div className="mt-4 flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
          <CalendarClock
            className={cn(
              "size-3.5",
              overdue ? "text-priority-high" : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              overdue ? "text-priority-high" : "text-muted-foreground",
            )}
          >
            {range}
          </span>
        </div>
      ) : null}
    </>
  );
}

const CARD_SHADOW =
  "shadow-[0_8px_24px_-16px_rgba(0,0,0,0.55)] hover:shadow-[0_12px_28px_-14px_rgba(0,0,0,0.65)]";

function SortableTaskCard({
  task,
  onSelect,
}: {
  task: TaskRow;
  onSelect: (task: TaskRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (isDragging || !start) return;
        const moved =
          Math.abs(e.clientX - start.x) > 6 || Math.abs(e.clientY - start.y) > 6;
        if (moved) return;
        onSelect(task);
      }}
      className={cn(
        "cursor-grab touch-none rounded-xl border border-white/[0.08] bg-[rgba(22,22,25,0.95)] p-4 transition-all active:cursor-grabbing",
        CARD_SHADOW,
        isDragging && "opacity-40",
      )}
    >
      <TaskCardBody task={task} />
    </Card>
  );
}

function Column({
  columnKey,
  label,
  accent,
  tasks,
  onAddTask,
  onSelectTask,
}: {
  columnKey: TaskStatus;
  label: string;
  accent: string;
  tasks: TaskRow[];
  onAddTask: () => void;
  onSelectTask: (task: TaskRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });

  return (
    <div className="flex w-[17.5rem] shrink-0 flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", accent)} />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {label}
          </h2>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddTask}>Add task</DropdownMenuItem>
            <DropdownMenuItem>Sort by due date</DropdownMenuItem>
            <DropdownMenuItem>Collapse column</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[12rem] flex-1 flex-col gap-2.5 rounded-2xl border border-white/[0.06] p-2.5 transition-colors",
          isOver
            ? "border-white/20 bg-white/[0.05]"
            : "bg-white/[0.02]",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onSelect={onSelectTask}
            />
          ))}
        </SortableContext>
        <button
          onClick={onAddTask}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.1] bg-transparent py-2.5 text-xs font-medium tracking-wide text-muted-foreground transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add task
        </button>
      </div>
    </div>
  );
}

function findColumn(board: Board, id: string): TaskStatus | undefined {
  if (id in board) return id as TaskStatus;
  return (Object.keys(board) as TaskStatus[]).find((col) =>
    board[col].some((t) => t.id === id),
  );
}

const TOLERANCE_CHIPS: { label: string; days: number }[] = [
  { label: "Exact Dates", days: 0 },
  { label: "± 1 Day", days: 1 },
  { label: "± 2 Days", days: 2 },
  { label: "± 3 Days", days: 3 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: string | Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function withinTolerance(due: string | null, target: Date, tolerance: number) {
  if (!due) return false;
  const diff = Math.abs(startOfDay(due).getTime() - startOfDay(target).getTime());
  return Math.round(diff / DAY_MS) <= tolerance;
}

function filterBoard(board: Board, target: Date | undefined, tolerance: number): Board {
  if (!target) return board;
  const next = emptyBoard();
  for (const col of Object.keys(board) as TaskStatus[]) {
    next[col] = board[col].filter((t) => withinTolerance(t.due_date, target, tolerance));
  }
  return next;
}

function TimeframeFilter({
  date,
  tolerance,
  onDateChange,
  onToleranceChange,
  onClear,
}: {
  date: Date | undefined;
  tolerance: number;
  onDateChange: (d: Date | undefined) => void;
  onToleranceChange: (t: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = Boolean(date);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "gap-1.5 border border-white/[0.08] bg-white/[0.03]",
            active && "text-foreground",
          )}
        >
          <CalendarRange className="size-4" />
          {active
            ? `${date!.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${
                TOLERANCE_CHIPS.find((c) => c.days === tolerance)?.label ?? "Exact Dates"
              }`
            : "Timeframe"}
          {active ? (
            <X
              className="ml-1 size-3.5 opacity-70 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.98)] p-3 text-foreground shadow-xl"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          initialFocus
          className="pointer-events-auto p-0"
        />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.08] pt-3">
          {TOLERANCE_CHIPS.map((chip) => {
            const selected = tolerance === chip.days;
            return (
              <button
                key={chip.days}
                type="button"
                onClick={() => onToleranceChange(chip.days)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20]"
                    : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}


function TasksPage() {
  const fetchTasks = useServerFn(listTasks);
  const persist = useServerFn(reorderTasks);
  const queryClient = useQueryClient();
  const { collapsed } = useAppSidebar();

  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const [board, setBoard] = useState<Board>(emptyBoard());
  const boardRef = useRef(board);
  boardRef.current = board;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [tolerance, setTolerance] = useState(0);
  const [view, setView] = useState<"board" | "list">("board");

  function openTaskDetail(task: TaskRow) {
    setSelectedTask(task);
    setDetailOpen(true);
  }


  useEffect(() => {
    if (data) setBoard(groupTasks(data));
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const mutation = useMutation({
    mutationFn: (tasks: TaskOrderInput[]) => persist({ data: { tasks } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not update task status");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const activeTask = useMemo(() => {
    if (!activeId) return null;
    for (const col of Object.keys(board) as TaskStatus[]) {
      const found = board[col].find((t) => t.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, board]);

  const displayBoard = useMemo(
    () => filterBoard(board, filterDate, tolerance),
    [board, filterDate, tolerance],
  );


  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const prev = boardRef.current;
    const activeCol = findColumn(prev, String(active.id));
    const overCol = findColumn(prev, String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    setBoard(() => {
      const item = prev[activeCol].find((t) => t.id === active.id);
      if (!item) return prev;
      const overItems = prev[overCol];
      const overIndex = overItems.findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;
      return {
        ...prev,
        [activeCol]: prev[activeCol].filter((t) => t.id !== active.id),
        [overCol]: [
          ...overItems.slice(0, insertAt),
          { ...item, status: overCol },
          ...overItems.slice(insertAt),
        ],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const current = boardRef.current;

    const fromCol = findColumn(current, activeId);
    const toCol = findColumn(current, overId);
    if (!fromCol || !toCol) return;

    let next: Board = current;

    if (fromCol === toCol) {
      const items = current[fromCol];
      const oldIndex = items.findIndex((t) => t.id === activeId);
      const newIndex = items.findIndex((t) => t.id === overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        const reordered = [...items];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);
        next = { ...current, [fromCol]: reordered };
      }
    } else {
      const alreadyMoved = current[toCol].some((t) => t.id === activeId);
      if (!alreadyMoved) {
        const item = current[fromCol].find((t) => t.id === activeId);
        if (!item) return;
        const overItems = current[toCol];
        const overIndex = overItems.findIndex((t) => t.id === overId);
        const insertAt = overIndex >= 0 ? overIndex : overItems.length;
        next = {
          ...current,
          [fromCol]: current[fromCol].filter((t) => t.id !== activeId),
          [toCol]: [
            ...overItems.slice(0, insertAt),
            { ...item, status: toCol },
            ...overItems.slice(insertAt),
          ],
        };
      } else {
        next = {
          ...current,
          [toCol]: current[toCol].map((t) =>
            t.id === activeId ? { ...t, status: toCol } : t,
          ),
        };
      }
    }

    if (next !== current) setBoard(next);

    const changed: TaskOrderInput[] = [];
    for (const col of Object.keys(next) as TaskStatus[]) {
      next[col].forEach((t, idx) => {
        changed.push({ id: t.id, status: col, sort_order: idx });
      });
    }
    mutation.mutate(changed);
  }

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] min-w-0 py-4 sm:py-6">
      <div className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-col gap-6 px-3 sm:px-5 md:px-7 lg:px-8 xl:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Tasks
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track work across every case · drag cards to update status
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1">
              <button
                type="button"
                onClick={() => setView("board")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "board"
                    ? "bg-white/[0.1] text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5" />
                Board
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "list"
                    ? "bg-white/[0.1] text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="size-3.5" />
                List
              </button>
            </div>

            <TimeframeFilter
              date={filterDate}
              tolerance={tolerance}
              onDateChange={setFilterDate}
              onToleranceChange={setTolerance}
              onClear={() => {
                setFilterDate(undefined);
                setTolerance(0);
              }}
            />

            <Button
              onClick={() => setSheetOpen(true)}
              className="gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
            >
              <Plus className="size-4" />
              Add task
            </Button>
          </div>
        </div>

        {isLoading && view === "list" ? <ListSkeleton rows={6} /> : null}
        {!isLoading && view === "list" ? (
          <TaskListView
            tasks={(Object.keys(displayBoard) as TaskStatus[]).flatMap(
              (col) => displayBoard[col],
            )}
            onSelect={openTaskDetail}
          />
        ) : null}
      </div>

      {isLoading && view === "board" ? (
        <div className="mt-6 px-3 sm:px-5 md:px-7 lg:px-8 xl:px-10">
          <BoardSkeleton />
        </div>
      ) : null}

      {!isLoading && view === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div
            className={cn(
              "mt-6 flex min-w-0 gap-4 overflow-x-auto overscroll-x-contain pb-2",
              // Full AppMain width: left bleeds under sidebar; right to viewport (small end pad).
              "pr-3 sm:pr-4",
              collapsed
                ? "pl-3 sm:pl-5 md:pl-7 lg:-ml-[4.25rem] lg:pl-[calc(4.25rem+2rem)] xl:pl-[calc(4.25rem+2.5rem)]"
                : "pl-3 sm:pl-5 md:pl-7 lg:-ml-64 lg:pl-[calc(16rem+2rem)] xl:pl-[calc(16rem+2.5rem)]",
            )}
          >
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                columnKey={col.key}
                label={col.label}
                accent={col.accent}
                tasks={displayBoard[col.key]}
                onAddTask={() => setSheetOpen(true)}
                onSelectTask={openTaskDetail}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null} style={{ zIndex: 100 }}>
            {activeTask ? (
              <Card
                className={cn(
                  "rounded-xl border border-white/[0.08] bg-[rgba(22,22,25,0.98)] p-4",
                  CARD_SHADOW,
                )}
              >
                <TaskCardBody task={activeTask} />
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      <NewTaskSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <TaskDetailSheet
        task={selectedTask}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedTask(null);
        }}
      />
    </main>
  );
}
