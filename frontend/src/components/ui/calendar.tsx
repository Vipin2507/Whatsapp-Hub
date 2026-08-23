import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const currentYear = new Date().getFullYear();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown-buttons"
      fromYear={currentYear - 8}
      toYear={currentYear + 5}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col space-y-2",
        month: "space-y-2",
        caption: "relative flex items-center justify-center gap-1 pt-0.5",
        caption_label: "sr-only",
        caption_dropdowns: "flex items-center gap-1.5",
        dropdown: "h-7 rounded-md border border-input bg-card px-1.5 text-[11px] font-medium text-foreground outline-none focus:ring-1 focus:ring-primary/30",
        dropdown_month: "pr-1",
        dropdown_year: "pr-1",
        dropdown_icon: "hidden",
        nav: "flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:bg-primary/10 hover:text-primary",
        ),
        nav_button_previous: "absolute left-0",
        nav_button_next: "absolute right-0",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "w-8 rounded-md text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        row: "mt-0.5 flex w-full",
        cell: "relative h-8 w-8 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 text-[12px] font-medium text-foreground hover:bg-primary/10 hover:text-primary aria-selected:opacity-100",
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/30",
        day_outside: "day-outside text-muted-foreground/50 opacity-60 aria-selected:bg-primary/20 aria-selected:text-primary-foreground",
        day_disabled: "text-muted-foreground opacity-40",
        day_range_middle: "aria-selected:bg-primary/10 aria-selected:text-primary",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-3.5 w-3.5" />,
        IconRight: () => <ChevronRight className="h-3.5 w-3.5" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
