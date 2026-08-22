import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINES = [
  "Loading workspace",
  "Syncing accounts",
  "Preparing inbox",
  "Checking schedules",
];

interface BrandedLoaderProps {
  overlay?: boolean;
  className?: string;
}

export function BrandedLoader({ overlay, className }: BrandedLoaderProps) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLine((i) => (i + 1) % LINES.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5",
        overlay
          ? "absolute inset-0 z-50 bg-background/55 backdrop-blur-[3px]"
          : "h-screen w-full bg-background",
        className,
      )}
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-md border-2 border-primary/30 animate-pulse-ring" />
        <span className="absolute inset-1.5 rounded-md border border-primary/40 animate-pulse-ring [animation-delay:250ms]" />
        <span className="relative flex h-8 w-8 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground shadow-brand">
          B
        </span>
      </div>
      <div className="w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-0.5 w-1/2 rounded-full bg-primary animate-shimmer" />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {LINES[line]}
      </p>
    </div>
  );
}
