import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createCase,
  listClientOptions,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const FIELD_CLASS =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

export function NewCaseSheet({ open, onOpenChange }: NewCaseSheetProps) {
  const queryClient = useQueryClient();
  const create = useServerFn(createCase);
  const fetchClients = useServerFn(listClientOptions);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [caseType, setCaseType] = useState<CaseType | "">("");
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const clientsQuery = useQuery({
    queryKey: ["client-options"],
    queryFn: () => fetchClients(),
    enabled: open,
  });

  const clients = clientsQuery.data ?? [];

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const reset = () => {
    setTitle("");
    setClientId("");
    setCaseType("");
    setFormError(null);
  };

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: title.trim(),
          client_id: clientId,
          case_type: caseType as CaseType,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Matter created — ${result.case_ref}`);
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["my-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ops-dashboard"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Could not create matter.";
      setFormError(message);
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      const message = "Title is required.";
      setFormError(message);
      toast.error(message);
      return;
    }
    if (!clientId) {
      const message = "Please select a client.";
      setFormError(message);
      toast.error(message);
      return;
    }
    if (!caseType) {
      const message = "Please select a matter type.";
      setFormError(message);
      toast.error(message);
      return;
    }
    mutation.mutate();
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setFormError(null);
          onOpenChange(next);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New matter</SheetTitle>
            <SheetDescription>
              A unique reference (CASE-YYYY-NNNN) and standard folders are
              created automatically on save. Add stages and deadlines from the
              matter Stages tab.
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
                placeholder="e.g. Property sale — 12 High Street"
                required
                className={FIELD_CLASS}
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
                    className={cn(
                      "w-full justify-between font-normal",
                      FIELD_CLASS,
                    )}
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
              <Label>Matter type *</Label>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "w-full justify-between font-normal",
                      FIELD_CLASS,
                    )}
                  >
                    <span className={cn(!caseType && "text-muted-foreground")}>
                      {caseType ? CASE_TYPE_LABELS[caseType] : "Select a matter type"}
                    </span>
                    <ChevronDown className="size-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {CASE_TYPES.map((t) => (
                    <DropdownMenuItem
                      key={t}
                      onSelect={() => setCaseType(t)}
                      className="justify-between gap-2"
                    >
                      {CASE_TYPE_LABELS[t]}
                      {caseType === t ? <Check className="size-4 shrink-0" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {formError ? (
              <p className="rounded-md border border-priority-high/30 bg-priority-high/10 px-3 py-2 text-sm text-priority-high">
                {formError}
              </p>
            ) : null}

            <SheetFooter className="mt-auto flex-row gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 border border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/[0.1] hover:text-foreground"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save matter"}
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
