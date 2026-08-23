import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DashboardStatsParams } from "@/lib/api";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { DateField } from "@/components/DateFields";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Building2,
  Calendar,
  ClipboardList,
  MessageSquare,
  Filter,
  RefreshCw,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, subDays } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { KpiCard } from "@/components/KpiCard";
import { PendingChip } from "@/components/PendingChip";
import { BrandedLoader } from "@/components/BrandedLoader";
import { cardStagger } from "@/lib/motion";

const SERIES = {
  primary: "var(--color-chart-primary)",
  deep: "var(--color-chart-deep)",
  success: "var(--color-chart-success)",
  warning: "var(--color-chart-warning)",
  danger: "var(--color-chart-danger)",
};

const STAGE_COLORS: Record<string, string> = {
  New: SERIES.primary,
  "Follow-up": SERIES.deep,
  Hot: SERIES.warning,
  Cold: SERIES.danger,
  Closed: SERIES.success,
};

const DATE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const STAGES = ["All", "New", "Follow-up", "Hot", "Cold", "Closed"];

const tooltipStyle = {
  backgroundColor: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

interface DashboardAnalyticsProps {
  className?: string;
  onOpenContacts?: () => void;
  onOpenScheduler?: () => void;
  onOpenLists?: () => void;
}

function tickDate(value: string) {
  try {
    return format(parseISO(value), "d MMM");
  } catch {
    return value;
  }
}

export function DashboardAnalytics({
  className,
  onOpenContacts,
  onOpenScheduler,
  onOpenLists,
}: DashboardAnalyticsProps) {
  const [datePreset, setDatePreset] = useState<number>(7);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  const params: DashboardStatsParams = useMemo(() => {
    const p: DashboardStatsParams = {};
    if (stageFilter && stageFilter !== "All") p.stage = stageFilter;
    if (useCustomRange && customFrom && customTo) {
      p.date_from = new Date(customFrom).toISOString().slice(0, 10);
      p.date_to = new Date(customTo).toISOString().slice(0, 10);
    } else {
      p.days = datePreset;
    }
    return p;
  }, [datePreset, customFrom, customTo, useCustomRange, stageFilter]);

  const { data: stats, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-stats", params],
    queryFn: () => api.dashboard.getStats(params),
    refetchInterval: 60000,
  });

  const handleExportCSV = () => {
    if (!stats?.messages_timeline?.length) {
      toast.message("No timeline data to export");
      return;
    }
    const headers = "Date,Messages\n";
    const rows = stats.messages_timeline.map((d) => `${d.date},${d.count}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-messages-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  const stageData = useMemo(() => {
    if (!stats?.stage_distribution) return [];
    return Object.entries(stats.stage_distribution).map(([name, value]) => ({
      name,
      value,
      fill: STAGE_COLORS[name] || SERIES.primary,
    }));
  }, [stats?.stage_distribution]);

  const timeline = useMemo(
    () =>
      (stats?.messages_timeline ?? []).map((d) => ({
        ...d,
        label: tickDate(d.date),
      })),
    [stats?.messages_timeline],
  );

  const workload = useMemo(
    () => [
      { name: "Contacts", short: "Ctc", value: stats?.total_leads ?? 0, fill: SERIES.primary },
      { name: "Messages", short: "Msg", value: stats?.total_msgs ?? 0, fill: SERIES.deep },
      { name: "Queued", short: "Q", value: stats?.pending_schedules ?? 0, fill: SERIES.warning },
      { name: "Lists", short: "Lst", value: stats?.total_segments ?? 0, fill: SERIES.success },
    ],
    [stats],
  );

  const closed = stats?.stage_distribution?.Closed ?? 0;
  const total = stats?.total_leads ?? 0;
  const healthPct = total > 0 ? Math.round((closed / total) * 100) : 0;
  const pending = stats?.pending_schedules ?? 0;

  if (isLoading) {
    return <BrandedLoader overlay className={cn("min-h-[min(60dvh,24rem)]", className)} />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(pending > 0 || (stats?.recent_leads ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {pending > 0 && (
            <PendingChip
              label="Queued sends"
              value={pending}
              tone="warning"
              icon={Calendar}
              onClick={onOpenScheduler}
            />
          )}
          {(stats?.recent_leads ?? 0) > 0 && (
            <PendingChip
              label="New in period"
              value={stats?.recent_leads ?? 0}
              tone="info"
              icon={Building2}
              onClick={onOpenContacts}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          {
            key: "contacts",
            label: "Contacts",
            value: stats?.total_leads ?? 0,
            icon: Building2,
            tone: "primary" as const,
            onClick: onOpenContacts,
            hint: stats?.recent_leads ? `${stats.recent_leads} in period` : undefined,
          },
          {
            key: "messages",
            label: "Messages",
            value: stats?.total_msgs ?? 0,
            icon: MessageSquare,
            tone: "info" as const,
            hint: stats?.recent_messages ? `${stats.recent_messages} in period` : undefined,
          },
          {
            key: "lists",
            label: "Lists",
            value: stats?.total_segments ?? 0,
            icon: ClipboardList,
            tone: "success" as const,
            onClick: onOpenLists,
          },
          {
            key: "pending",
            label: "Queued",
            value: pending,
            icon: Calendar,
            tone: pending > 0 ? ("warning" as const) : ("muted" as const),
            onClick: onOpenScheduler,
          },
        ].map((kpi, i) => (
          <motion.div key={kpi.key} className="min-w-0" {...cardStagger(i)}>
            <KpiCard
              {...kpi}
              active={activeKpi === kpi.key}
              onClick={
                kpi.onClick
                  ? () => {
                      setActiveKpi(kpi.key);
                      kpi.onClick?.();
                    }
                  : undefined
              }
            />
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 items-center gap-1.5">
          <Filter className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => {
                  setUseCustomRange(false);
                  setDatePreset(p.days);
                }}
                className={cn(
                  "h-8 shrink-0 cursor-pointer rounded-md border px-2.5 text-xs font-medium",
                  !useCustomRange && datePreset === p.days
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setUseCustomRange(true);
                const to = new Date();
                const from = subDays(to, 7);
                setCustomFrom(format(from, "yyyy-MM-dd"));
                setCustomTo(format(to, "yyyy-MM-dd"));
              }}
              className={cn(
                "h-8 shrink-0 cursor-pointer rounded-md border px-2.5 text-xs font-medium",
                useCustomRange
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/40",
              )}
            >
              Custom
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[132px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="hidden text-[10px] tabular-nums text-muted-foreground md:inline">
            {isFetching ? "Updating…" : `${total} records`}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 w-8 px-0" title="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 w-8 px-0" title="Export CSV">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {useCustomRange && (
        <div className="grid grid-cols-2 gap-1.5 sm:max-w-sm">
          <DateField value={customFrom} onChange={setCustomFrom} placeholder="From" size="sm" />
          <DateField value={customTo} onChange={setCustomTo} placeholder="To" size="sm" min={customFrom} />
        </div>
      )}

      <div className="card-soft min-w-0 p-3 sm:p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Messages</p>
          <p className="text-[10px] tabular-nums text-muted-foreground md:hidden">
            {isFetching ? "Updating…" : `${total} records`}
          </p>
        </div>
        {timeline.length > 0 ? (
          <div className="h-40 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                />
                <Line type="monotone" dataKey="count" name="Messages" stroke={SERIES.primary} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart className="h-40 sm:h-48" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="card-soft min-w-0 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Account mix</p>
          {stageData.length > 0 ? (
            <>
              <div className="h-36 sm:h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stageData} dataKey="value" innerRadius={36} outerRadius={58} paddingAngle={2} stroke="none">
                      {stageData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {stageData.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStageFilter(s.name)}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium hover:border-primary/30",
                      stageFilter === s.name && "border-primary/40 bg-primary/10",
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fill }} />
                    {s.name}
                    <span className="tabular-nums text-muted-foreground">{s.value}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </div>

        <div className="card-soft min-w-0 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workload</p>
          <div className="h-36 sm:h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="short" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={0} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={28} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--muted))" }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {workload.map((row, i) => (
                    <Cell
                      key={row.name}
                      fill={row.fill}
                      className="cursor-pointer"
                      onClick={() => {
                        if (i === 0) onOpenContacts?.();
                        if (i === 2) onOpenScheduler?.();
                        if (i === 3) onOpenLists?.();
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-soft min-w-0 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</p>
          {stageData.length > 0 ? (
            <div className="h-36 sm:h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} className="cursor-pointer">
                    {stageData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} onClick={() => setStageFilter(entry.name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </div>

        <div className="card-soft min-w-0 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Health</p>
          <div className="flex h-36 items-center gap-3 sm:h-40">
            <HealthRing percent={healthPct} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Closed <span className="font-semibold tabular-nums text-foreground">{closed}</span> of{" "}
                <span className="tabular-nums">{total}</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="flex h-full">
                  <div className="h-full bg-success" style={{ width: `${healthPct}%` }} />
                  <div className="h-full bg-warning" style={{ width: `${Math.min(100 - healthPct, pending > 0 ? 20 : 8)}%` }} />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">Completion vs remaining pipeline</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-36 flex-col items-center justify-center gap-1 text-center sm:h-40", className)}>
      <p className="text-xs text-muted-foreground">No data in this range</p>
    </div>
  );
}

function HealthRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 sm:h-[4.5rem] sm:w-[4.5rem]">
      <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--color-chart-success)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[11px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
        {percent}%
      </text>
    </svg>
  );
}
