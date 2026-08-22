import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE, hoverLift, tapScale } from "@/lib/motion";
import { CountUp } from "@/components/CountUp";

const TONE = {
  warning: "border-warning/30 bg-warning/10 text-warning-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  muted: "border-border bg-muted/40 text-muted-foreground",
} as const;

export type ChipTone = keyof typeof TONE;

interface PendingChipProps {
  label: string;
  value: number;
  tone?: ChipTone;
  icon?: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}

export function PendingChip({
  label,
  value,
  tone = "muted",
  icon: Icon,
  active,
  onClick,
}: PendingChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={hoverLift}
      whileTap={tapScale}
      transition={{ duration: 0.16, ease: EASE }}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1",
        TONE[tone],
        active && "ring-2 ring-primary/40",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span className="text-[10px] font-medium">{label}</span>
      <CountUp value={value} className="text-[10px] font-semibold tabular-nums" />
    </motion.button>
  );
}

const PILL_TONE = {
  muted: "border-border bg-muted/40 text-muted-foreground",
  info: "border-primary/30 bg-primary/15 text-primary",
  success: "border-success/30 bg-success/15 text-success",
  warning: "border-warning/30 bg-warning/15 text-warning-foreground",
  danger: "border-destructive/30 bg-destructive/15 text-destructive",
} as const;

const DOT = {
  muted: "bg-muted-foreground",
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
} as const;

interface StatusPillProps {
  label: string;
  tone?: keyof typeof PILL_TONE;
  dot?: boolean;
  className?: string;
}

export function StatusPill({ label, tone = "muted", dot = true, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        PILL_TONE[tone],
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} /> : null}
      {label}
    </span>
  );
}
