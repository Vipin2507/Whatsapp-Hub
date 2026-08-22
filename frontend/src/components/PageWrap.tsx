import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pageEnter } from "@/lib/motion";

interface PageWrapProps {
  children: ReactNode;
  className?: string;
}

export function PageWrap({ children, className }: PageWrapProps) {
  return (
    <motion.div
      initial={pageEnter.initial}
      animate={pageEnter.animate}
      transition={pageEnter.transition}
      className={cn(
        "space-y-2.5 p-3 sm:p-4 lg:p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
        {subtitle ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex h-8 shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
