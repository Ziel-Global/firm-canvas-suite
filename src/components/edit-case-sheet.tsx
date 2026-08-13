import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import {
  CASE_TYPES,
  getCaseDetail,
  listClientOptions,
  updateCase,
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

interface EditCaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
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

export function EditCaseSheet({
  open,
  onOpenChange,
  caseId,
}: EditCaseSheetProps) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getCaseDetail);
  const fetchClients = useServerFn(listClientOptions);
  const save = useServerFn(updateCase);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [caseType, setCaseType] = useState<CaseType | "">("");
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchDetail({ data: { id: caseId } }),
    enabled: open,
  });

  const clientsQuery = useQuery({
    queryKey: ["client-options"],
    queryFn: () => fetchClients(),
    enabled: open,
  });

  const clients = clientsQuery.data ?? [];

  useEffect(() => {
    if (!open || !detailQuery.data) return;
    setTitle(detailQuery.data.title ?? "");
    setClientId(detailQuery.data.client_id ?? "");
    const type = detailQuery.data.case_type;
    setCaseType(
      type && (CASE_TYPES as readonly string[]).includes(type)
        ? (type as CaseType)
        : "",
    );
    setFormError(null);
  }, [open, detailQuery.data]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: caseId,
          title: title.trim(),
          client_id: clientId,
          case_type: caseType as CaseType,
        },
      }),
    onSuccess: () => {
      toast.success("Matter updated");
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-overview", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["my-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ops-dashboard"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Could not update matter.";
      setFormError(message);
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!clientId) {
      toast.error("Please select a client.");
      return;
    }
    if (!caseType) {
      toast.error("Please select a matter type.");
      return;
    }
    mutation.mutate();
  };

  const loading = detailQuery.isLoading || clientsQuery.isLoading;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setFormError(null);
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit matter</SheetTitle>
          <SheetDescription>
            Update the matter title, client, and type. Status and team are managed
            separately.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <p className="px-1 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-4"
          >
            {detailQuery.data?.case_ref ? (
              <p className="text-xs text-muted-foreground">
                Reference{" "}
                <span className="font-medium text-foreground">
                  {detailQuery.data.case_ref}
                </span>
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="edit-case-title">Title *</Label>
              <Input
                id="edit-case-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-2">
              <Label>Client *</Label>
              <Popover
                open={clientPopoverOpen}
                onOpenChange={setClientPopoverOpen}
              >
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
                    <span
                      className={cn(!selectedClient && "text-muted-foreground")}
                    >
                      {selectedClient
                        ? `${selectedClient.full_name}${selectedClient.client_ref ? ` · ${selectedClient.client_ref}` : ""}`
                        : "Select a client"}
                    </span>
                    <ChevronsUpDown className="size-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
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
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {c.client_ref}
                                </span>
                              ) : null}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Matter type *</Label>
              <DropdownMenu>
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
                      {caseType
                        ? CASE_TYPE_LABELS[caseType]
                        : "Select a type"}
                    </span>
                    <ChevronDown className="size-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[--radix-dropdown-menu-trigger-width]"
                >
                  {CASE_TYPES.map((t) => (
                    <DropdownMenuItem
                      key={t}
                      onSelect={() => setCaseType(t)}
                    >
                      {CASE_TYPE_LABELS[t]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}

            <SheetFooter className="mt-auto gap-2 sm:flex-col">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
