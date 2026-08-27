import { useState } from "react";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { format, isValid, parse, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

function parseISODate(value?: string) {
  if (!value) return undefined;
  const parsed = parse(value.slice(0, 10), "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function formatISODate(date?: Date) {
  return date && isValid(date) ? format(date, "yyyy-MM-dd") : "";
}

function parseTime(value?: string) {
  const match = (value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "09:00";
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDisplayDate(value?: string) {
  const date = parseISODate(value);
  return date ? format(date, "d MMM yyyy") : "";
}

function formatDisplayTime(value?: string) {
  const time = parseTime(value);
  const parsed = parse(time, "HH:mm", new Date());
  return isValid(parsed) ? format(parsed, "h:mm a") : time;
}

function toDay(value?: string) {
  const date = parseISODate(value);
  return date ? startOfDay(date) : undefined;
}

function triggerClass(size: Size, empty: boolean, className?: string) {
  return cn(
    "flex w-full items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-left font-medium ring-offset-background",
    "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
    "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-muted/40",
    empty ? "text-muted-foreground" : "text-foreground",
    size === "sm" ? "h-8 text-[11px]" : "h-9 text-xs",
    className,
  );
}

function TimeSelects({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const time = parseTime(value);
  const [hour, minute] = time.split(":");
  return (
    <div className="flex items-center gap-1.5">
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <select
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        className="h-8 rounded-md border border-input bg-card px-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-primary/30"
      >
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">:</span>
      <select
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        className="h-8 rounded-md border border-input bg-card px-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-primary/30"
      >
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DateField({
  value,
  onChange,
  placeholder = "Pick date",
  className,
  size = "md",
  min,
  max,
  allowClear = false,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  size?: Size;
  min?: string;
  max?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const minDay = toDay(min);
  const maxDay = toDay(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={triggerClass(size, !value, className)}>
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{value ? formatDisplayDate(value) : placeholder}</span>
          {allowClear && value ? (
            <span
              role="button"
              tabIndex={-1}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[400] w-auto border bg-card p-2 shadow-elevated">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(formatISODate(date));
            if (date) setOpen(false);
          }}
          disabled={(day) => {
            const start = startOfDay(day);
            if (minDay && start < minDay) return true;
            if (maxDay && start > maxDay) return true;
            return false;
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateTimeField({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
  size = "md",
  min,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  size?: Size;
  min?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const datePart = value?.split("T")[0] || "";
  const timePart = parseTime(value?.includes("T") ? value.split("T")[1] : "09:00");
  const selected = parseISODate(datePart);
  const minDay = toDay(min?.slice(0, 10));
  const label = datePart ? `${formatDisplayDate(datePart)} · ${formatDisplayTime(timePart)}` : "";

  const commit = (nextDate: string, nextTime = timePart) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={triggerClass(size, !value, className)}>
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{label || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[400] w-auto border bg-card p-2 shadow-elevated">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => commit(formatISODate(date), timePart)}
          disabled={(day) => Boolean(minDay && startOfDay(day) < minDay)}
        />
        <div className="mt-2 flex items-center justify-between gap-2 border-t px-1 pt-2">
          <TimeSelects value={timePart} onChange={(next) => commit(datePart || formatISODate(new Date()), next)} />
          <button
            type="button"
            className="h-8 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TimeField({
  value,
  onChange,
  placeholder = "Pick time",
  className,
  size = "md",
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  size?: Size;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const time = value ? parseTime(value) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={triggerClass(size, !value, className)}>
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{time ? formatDisplayTime(time) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[400] w-auto border bg-card p-3 shadow-elevated">
        <TimeSelects value={time || "09:00"} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
