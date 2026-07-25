import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DayButton, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DarkDatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

/**
 * Dark-surface date picker. Closes after a date is chosen.
 */
export function DarkDatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  align = "start",
}: DarkDatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto rounded-card border border-white/10 bg-surface-dark p-3 text-white shadow-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange?.(date);
            setOpen(false);
          }}
          className="pointer-events-auto bg-transparent p-0 text-white"
          classNames={{
            weekday: "text-white/40 flex-1 select-none rounded-md text-[0.8rem] font-normal",
            today:
              "rounded-full bg-white/10 text-white data-[selected=true]:bg-transparent",
            outside: "text-white/30 aria-selected:text-primary-ink",
            day: "group/day relative aspect-square h-full w-full select-none p-0 text-center",
          }}
          components={{
            DayButton: DarkCalendarDayButton,
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function DarkCalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const selectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={selectedSingle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex aspect-square h-auto w-full min-w-(--cell-size) flex-col gap-1 rounded-full font-normal leading-none text-white",
        "hover:bg-white/12 hover:text-white",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-ink",
        "data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-ink",
        "data-[selected-single=true]:shadow-[0_0_0_1px_rgba(255,255,255,0.35)]",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10",
        "group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-white/30",
        "[&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}
