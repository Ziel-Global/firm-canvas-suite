import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type PremiumSelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
};

type PremiumSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: PremiumSelectOption[];
  placeholder?: string;
  /** Shown on the trigger when value is empty / unmatched */
  emptyLabel?: string;
  /** Leading icon in the closed trigger */
  leadingIcon?: ReactNode;
  /** Enable search when there are many options */
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  "aria-label"?: string;
};

/**
 * Glass-style single-select for dark surfaces: two-line options,
 * soft elevation, and a clear selected state.
 */
export function PremiumSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyLabel,
  leadingIcon,
  searchable = false,
  searchPlaceholder = "Search…",
  className,
  contentClassName,
  align = "start",
  disabled = false,
  "aria-label": ariaLabel,
}: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      const hay = `${option.label} ${option.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  const triggerLabel = selected
    ? selected.label
    : (emptyLabel ?? placeholder);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-11 w-full justify-between gap-2 rounded-xl border-white/[0.08] bg-[#14161a] px-3.5 text-left font-normal text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            "hover:border-white/16 hover:bg-[#17191d] hover:text-foreground",
            "data-[state=open]:border-white/20 data-[state=open]:bg-[#17191d]",
            "focus-visible:ring-1 focus-visible:ring-white/20",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            {leadingIcon ? (
              <span className="shrink-0 text-muted-foreground">{leadingIcon}</span>
            ) : selected?.icon ? (
              <span className="shrink-0 text-muted-foreground">{selected.icon}</span>
            ) : null}
            <span className="min-w-0 truncate text-sm tracking-tight">
              {triggerLabel}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={8}
        className={cn(
          "w-[var(--radix-popover-trigger-width)] min-w-[16rem] overflow-hidden rounded-2xl border border-white/[0.1] p-0",
          "bg-[rgba(16,17,20,0.96)] text-foreground shadow-[0_28px_60px_-24px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)]",
          "backdrop-blur-xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-1",
          contentClassName,
        )}
      >
        {searchable ? (
          <div className="border-b border-white/[0.06] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-white/15"
              />
            </div>
          </div>
        ) : null}

        <div
          role="listbox"
          aria-label={ariaLabel ?? placeholder}
          className="max-h-72 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches
            </p>
          ) : (
            filtered.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty__"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                    active
                      ? "bg-white/[0.08]"
                      : "hover:bg-white/[0.05]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                      active
                        ? "border-white/20 bg-white/[0.1] text-foreground"
                        : "border-white/[0.08] bg-white/[0.03] text-muted-foreground group-hover:text-foreground/80",
                    )}
                  >
                    {option.icon ?? (
                      <span className="size-1.5 rounded-full bg-current opacity-70" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm tracking-tight",
                        active ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                      )}
                    >
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={cn(
                      "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full transition-opacity",
                      active
                        ? "bg-primary text-primary-ink opacity-100"
                        : "opacity-0 group-hover:opacity-30",
                    )}
                  >
                    <Check className="size-3 stroke-[2.5]" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
