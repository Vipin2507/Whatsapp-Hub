import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface SelectCheckProps {
  checked: boolean;
  indeterminate?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  label?: string;
  className?: string;
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-[11px] w-[11px]" fill="none" aria-hidden>
      <path
        d="M3.4 8.35 6.55 11.4 12.6 4.5"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-[11px] w-[11px]" fill="none" aria-hidden>
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
    </svg>
  );
}

export function SelectCheck({ checked, indeterminate = false, onClick, label, className }: SelectCheckProps) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border p-0",
        "transition-[background-color,border-color,box-shadow] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-[#c5d0dc] bg-white hover:border-primary/55 hover:bg-primary/[0.04] dark:border-input dark:bg-card",
        className,
      )}
    >
      {indeterminate && !checked ? <DashGlyph /> : checked ? <CheckGlyph /> : null}
    </button>
  );
}
