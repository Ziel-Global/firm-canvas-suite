import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CalendarIcon, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  createTask,
  getTaskFormOptions,
  type CreateTaskTagInput,
} from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/mic-button";
import { CleanupButton } from "@/components/cleanup-button";
import { Tag } from "@/components/ui/tag";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NewTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCaseId?: string | null;
  lockCase?: boolean;
}

const NO_CASE = "__none__";
const FIELD_CLASS =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";
const TAG_COLORS = ["purple", "blue", "sand", "green"] as const;
type TagColor = (typeof TAG_COLORS)[number];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
  support: "Support",
};

export function NewTaskSheet({
  open,
  onOpenChange,
  defaultCaseId,
  lockCase,
}: NewTaskSheetProps) {
  const queryClient = useQueryClient();
  const fetchOptions = useServerFn(getTaskFormOptions);
  const create = useServerFn(createTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState<string>(defaultCaseId ?? NO_CASE);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<string>("medium");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [tags, setTags] = useState<CreateTaskTagInput[]>([]);
  const [tagLabel, setTagLabel] = useState("");
  const [tagColor, setTagColor] = useState<TagColor>("purple");

  const optionsCaseId = caseId === NO_CASE ? null : caseId;

  const optionsQuery = useQuery({
    queryKey: ["task-form-options", optionsCaseId],
    queryFn: () =>
      fetchOptions({
        data: { caseId: optionsCaseId },
      }),
    enabled: open,
  });

  const options = optionsQuery.data;
  const assignees = options?.assignees ?? [];
  const cases = options?.cases ?? [];

  // Drop a stale assignee when the case (and therefore the team list) changes.
  useEffect(() => {
    if (!open) return;
    if (!assigneeId) return;
    if (assignees.some((a) => a.id === assigneeId)) return;
    setAssigneeId("");
  }, [open, assigneeId, assignees]);

  function reset() {
    setTitle("");
    setDescription("");
    setCaseId(defaultCaseId ?? NO_CASE);
    setAssigneeId("");
    setPriority("medium");
    setStartDate(undefined);
    setDueDate(undefined);
    setTags([]);
    setTagLabel("");
    setTagColor("purple");
  }

  function addTag() {
    const label = tagLabel.trim();
    if (!label) return;
    setTags((prev) => [...prev, { label, color: tagColor }]);
    setTagLabel("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          case_id: caseId === NO_CASE ? null : caseId,
          assignee_id: assigneeId || null,
          priority: (priority as "low" | "medium" | "high") || null,
          start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
          due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
          tags,
        },
      }),
    onSuccess: () => {
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-dashboard"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!title.trim()) {
      toast.error("A task title is required.");
      return;
    }
    if (options?.canAssignOthers && !assigneeId) {
      toast.error("Choose who this task is assigned to.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New task</SheetTitle>
          <SheetDescription>
            Create a task and assign it to a team member.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Draft settlement agreement"
              className={FIELD_CLASS}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <div className="relative">
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details"
                rows={3}
                className={cn("pr-[4.5rem]", FIELD_CLASS)}
              />
              <div className="absolute right-2 top-2 flex items-center gap-0.5">
                <CleanupButton
                  text={description}
                  onCleaned={setDescription}
                />
                <MicButton
                  onTranscript={(text) => setDescription(prev => prev ? prev + " " + text : text)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Matter (optional)</Label>
            <Select
              value={caseId}
              onValueChange={(value) => {
                setCaseId(value);
                setAssigneeId("");
              }}
              disabled={lockCase}
            >
              <SelectTrigger className={FIELD_CLASS}>
                <SelectValue placeholder="No matter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE}>No matter</SelectItem>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.case_ref ? `${c.case_ref} — ` : ""}
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>


          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select
              value={assigneeId}
              onValueChange={setAssigneeId}
              disabled={optionsQuery.isLoading}
            >
              <SelectTrigger className={FIELD_CLASS}>
                <SelectValue
                  placeholder={
                    optionsCaseId
                      ? "Select someone on this matter"
                      : "Select assignee"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {assignees.length === 0 ? (
                  <SelectItem value="__none_available__" disabled>
                    {optionsCaseId
                      ? "No team members on this matter yet"
                      : "No assignees available"}
                  </SelectItem>
                ) : (
                  assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name}
                      {ROLE_LABELS[a.role] ? ` · ${ROLE_LABELS[a.role]}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {options && !options.canAssignOthers ? (
              <p className="text-xs text-muted-foreground">
                You can only assign tasks to yourself.
              </p>
            ) : optionsCaseId ? (
              <p className="text-xs text-muted-foreground">
                Only people assigned to this matter can be selected.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The assignee will see this task on their Tasks board immediately.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className={FIELD_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      FIELD_CLASS,
                      !startDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {startDate ? format(startDate, "MMM d") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      FIELD_CLASS,
                      !dueDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {dueDate ? format(dueDate, "MMM d") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            {tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <Tag key={`${t.label}-${i}`} color={t.color as TagColor}>
                    {t.label}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-0.5"
                      aria-label={`Remove ${t.label}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Tag>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTagColor(c)}
                    aria-label={`Tag colour ${c}`}
                    className={cn(
                      "size-6 rounded-full border-2",
                      `bg-tag-${c}`,
                      tagColor === c ? "border-foreground" : "border-transparent",
                    )}
                  />
                ))}
              </div>
              <Input
                value={tagLabel}
                onChange={(e) => setTagLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag"
                className={cn("flex-1", FIELD_CLASS)}
              />
              <Button type="button" variant="ghost" size="icon" onClick={addTag}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create task"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
