import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createCase,
  listClientOptions,
  listWorkflowTemplateOptions,
  CASE_TYPES,
  type CaseType,
} from "@/lib/cases.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { NewClientSheet } from "@/components/new-client-sheet";

interface NewCaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  property: "Property",
  litigation: "Litigation",
  corporate: "Corporate",
  criminal_defence: "Criminal defence",
  other: "Other",
};

const NO_TEMPLATE = "__none__";

export function NewCaseSheet({ open, onOpenChange }: NewCaseSheetProps) {
  const queryClient = useQueryClient();
  const create = useServerFn(createCase);
  const fetchClients = useServerFn(listClientOptions);
  const fetchTemplates = useServerFn(listWorkflowTemplateOptions);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [caseType, setCaseType] = useState<CaseType | "">("");
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ["client-options"],
    queryFn: () => fetchClients(),
    enabled: open,
  });
  const templatesQuery = useQuery({
    queryKey: ["workflow-template-options"],
    queryFn: () => fetchTemplates(),
    enabled: open,
  });

  const clients = clientsQuery.data ?? [];
  const templates = templatesQuery.data ?? [];

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const reset = () => {
    setTitle("");
    setClientId("");
    setCaseType("");
    setTemplateId(NO_TEMPLATE);
  };

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title,
          client_id: clientId,
          case_type: caseType as CaseType,
          workflow_template_id: templateId === NO_TEMPLATE ? null : templateId,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Case created — ${result.case_ref}`);
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not create case.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required.");
    if (!clientId) return toast.error("Please select a client.");
    if (!caseType) return toast.error("Please select a case type.");
    mutation.mutate();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New case</SheetTitle>
            <SheetDescription>
              A unique reference (CASE-YYYY-NNNN) and standard folders are
              created automatically on save.
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-4"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Client *</Label>
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    role="combobox"
                    aria-expanded={clientPopoverOpen}
                    className="w-full justify-between border border-border bg-surface font-normal"
                  >
                    <span className={cn(!selectedClient && "text-muted-foreground")}>
                      {selectedClient
                        ? `${selectedClient.full_name}${selectedClient.client_ref ? ` · ${selectedClient.client_ref}` : ""}`
                        : "Select a client"}
                    </span>
                    <ChevronsUpDown className="size-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search clients…" />
                    <CommandList>
                      <CommandEmpty>No clients found.</CommandEmpty>
                      <CommandGroup>
                        {clients.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.full_name} ${c.client_ref ?? ""}`}
                            onSelect={() => {
                              setClientId(c.id);
                              setClientPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                clientId === c.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">
                              {c.full_name}
                              {c.client_ref ? (
                                <span className="text-muted-foreground"> · {c.client_ref}</span>
                              ) : null}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandGroup>
                        <CommandItem
                          value="__create_new_client__"
                          onSelect={() => {
                            setClientPopoverOpen(false);
                            setNewClientOpen(true);
                          }}
                        >
                          <Plus className="mr-2 size-4" />
                          Create new client
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Case type *</Label>
              <Select
                value={caseType}
                onValueChange={(v) => setCaseType(v as CaseType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a case type" />
                </SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CASE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Workflow template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optional — copies the template's stages into the case.
              </p>
            </div>

            <SheetFooter className="mt-auto flex-row gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save case"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <NewClientSheet
        open={newClientOpen}
        onOpenChange={(o) => {
          setNewClientOpen(o);
          if (!o) {
            queryClient.invalidateQueries({ queryKey: ["client-options"] });
          }
        }}
      />
    </>
  );
}
