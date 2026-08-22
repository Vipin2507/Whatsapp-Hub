import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE, hoverLift, tapScale } from "@/lib/motion";
import { CountUp } from "@/components/CountUp";

const TONE = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
} as const;

export type KpiTone = keyof typeof TONE;

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: KpiTone;
  active?: boolean;
  onClick?: () => void;
  hint?: string;
  className?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  active,
  onClick,
  hint,
  className,
}: KpiCardProps) {
  const clickable = Boolean(onClick);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      whileHover={clickable ? hoverLift : undefined}
      whileTap={clickable ? tapScale : undefined}
      transition={{ duration: 0.18, ease: EASE }}
      className={cn(
        "flex min-h-[3.25rem] w-full min-w-0 items-center gap-2 rounded-lg border bg-card/60 px-2 py-2 text-left sm:min-h-0 sm:px-2.5 sm:py-1.5",
        clickable && "cursor-pointer hover:border-primary/30",
        !clickable && "cursor-default",
        active && "ring-2 ring-primary/40",
        className,
      )}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-7 sm:w-7", TONE[tone])}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <CountUp value={value} className="block text-base font-semibold tabular-nums leading-tight" />
        {hint ? <span className="block truncate text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
      {clickable ? <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" /> : null}
    </motion.button>
  );
}
