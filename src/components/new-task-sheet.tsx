import { useState } from "react";
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
}

const NO_CASE = "__none__";
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

export function NewTaskSheet({ open, onOpenChange }: NewTaskSheetProps) {
  const queryClient = useQueryClient();
  const fetchOptions = useServerFn(getTaskFormOptions);
  const create = useServerFn(createTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState<string>(NO_CASE);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<string>("medium");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [tags, setTags] = useState<CreateTaskTagInput[]>([]);
  const [tagLabel, setTagLabel] = useState("");
  const [tagColor, setTagColor] = useState<TagColor>("purple");

  const optionsQuery = useQuery({
    queryKey: ["task-form-options"],
    queryFn: () => fetchOptions(),
    enabled: open,
  });

  const options = optionsQuery.data;
  const assignees = options?.assignees ?? [];
  const cases = options?.cases ?? [];

  function reset() {
    setTitle("");
    setDescription("");
    setCaseId(NO_CASE);
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
    mutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New task</SheetTitle>
          <SheetDescription>
            Create a task and assign it to a team member.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Draft settlement agreement"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Case (optional)</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="No case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE}>No case</SelectItem>
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
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                    {ROLE_LABELS[a.role] ? ` · ${ROLE_LABELS[a.role]}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {options && !options.canAssignOthers ? (
              <p className="text-xs text-muted-foreground">
                You can only assign tasks to yourself.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
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
                      "w-full justify-start border border-input text-left font-normal",
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
                      "w-full justify-start border border-input text-left font-normal",
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
                className="flex-1"
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
