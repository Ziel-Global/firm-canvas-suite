import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

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
 * Date selection popover styled like the reference dark date picker:
 * near-black surface, lime-green selected date, muted weekday labels.
 */
export function DarkDatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  align = "start",
}: DarkDatePickerProps) {
  return (
    <Popover>
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
        className="w-auto rounded-card border-0 bg-surface-dark p-3 text-white shadow-xl"
      >
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn(
            "pointer-events-auto p-0 text-white",
            "[&_.rdp-weekday]:text-muted [&_button]:text-white",
            "[&_.rdp-day_button:hover]:bg-white/10",
            "[&_[aria-selected=true]]:!bg-primary [&_[aria-selected=true]]:!text-primary-ink",
          )}
        />
      </PopoverContent>
    </Popover>
  );
}
