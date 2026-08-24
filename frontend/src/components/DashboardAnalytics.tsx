import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type DashboardStatsParams } from "@/lib/api";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { DateField } from "@/components/DateFields";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  Calendar,
  ClipboardList,
  Download,
  Filter,
  Inbox,
  MessageSquare,
  RefreshCw,
  Reply,
  Send,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, subDays } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { KpiCard } from "@/components/KpiCard";
import { PendingChip, StatusPill } from "@/components/PendingChip";
import { BrandedLoader } from "@/components/BrandedLoader";
import { cardStagger } from "@/lib/motion";
import { useIsMobile } from "@/hooks/use-mobile";

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
  { label: "Today", days: 1 },
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
  onOpenInbox?: (phone?: string) => void;
}

function tickDate(value: string) {
  try {
    return format(parseISO(value), "d MMM");
  } catch {
    return value;
  }
}

function formatRange(from?: string, to?: string) {
  if (!from || !to) return "";
  try {
    return `${format(parseISO(from), "d MMM")} – ${format(parseISO(to), "d MMM yyyy")}`;
  } catch {
    return "";
  }
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function DashboardAnalytics({
  className,
  onOpenContacts,
  onOpenScheduler,
  onOpenLists,
  onOpenInbox,
}: DashboardAnalyticsProps) {
  const isCompact = useIsMobile();
  const [datePreset, setDatePreset] = useState<number>(7);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [showLeadsOnChart, setShowLeadsOnChart] = useState(true);

  const params: DashboardStatsParams = useMemo(() => {
    const p: DashboardStatsParams = {};
    if (stageFilter && stageFilter !== "All") p.stage = stageFilter;
    if (useCustomRange && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo;
      const to = customFrom <= customTo ? customTo : customFrom;
      p.date_from = from;
      p.date_to = to;
    } else {
      p.days = datePreset;
    }
    return p;
  }, [datePreset, customFrom, customTo, useCustomRange, stageFilter]);

  const { data: stats, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ["dashboard-stats", params],
    queryFn: () => api.dashboard.getStats(params),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    refetchInterval: 120000,
  });

  const handleExportCSV = () => {
    if (!stats) {
      toast.message("Nothing to export yet");
      return;
    }
    const lines = [
      "Section,Metric,Value",
      `Summary,Contacts,${stats.total_leads}`,
      `Summary,Messages all-time,${stats.total_msgs}`,
      `Summary,Messages in period,${stats.recent_messages ?? 0}`,
      `Summary,Inbound,${stats.inbound_messages ?? 0}`,
      `Summary,Outbound,${stats.outbound_messages ?? 0}`,
      `Summary,Unread,${stats.unread_total ?? 0}`,
      `Summary,Reply rate,${stats.reply_rate ?? ""}`,
      `Summary,Media,${stats.media_messages ?? 0}`,
      `Summary,Queued,${stats.pending_schedules}`,
      `Summary,Sent schedules,${stats.sent_schedules ?? 0}`,
      `Summary,Failed schedules,${stats.failed_schedules ?? 0}`,
      `Summary,Lists,${stats.total_segments}`,
      "",
      "Date,Messages,Inbound,Outbound,New contacts",
      ...(stats.messages_timeline ?? []).map((d) =>
        [d.date, d.count, d.inbound ?? 0, d.outbound ?? 0, d.leads ?? 0].join(","),
      ),
      "",
      "Stage,Count",
      ...Object.entries(stats.stage_distribution ?? {}).map(([name, value]) => `${csvEscape(name)},${value}`),
      "",
      "Owner,Count",
      ...Object.entries(stats.assigned_distribution ?? {}).map(([name, value]) => `${csvEscape(name)},${value}`),
      "",
      "Chat,Phone,Messages,Unread,Stage",
      ...(stats.top_chats ?? []).map((c) =>
        [csvEscape(c.name), c.phone, c.messages, c.unread, csvEscape(c.stage)].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Analytics exported");
  };

  const stageData = useMemo(() => {
    if (!stats?.stage_distribution) return [];
    return Object.entries(stats.stage_distribution).map(([name, value]) => ({
      name,
      value,
      fill: STAGE_COLORS[name] || SERIES.primary,
    }));
  }, [stats?.stage_distribution]);

  const assignedData = useMemo(() => {
    return Object.entries(stats?.assigned_distribution ?? {})
      .map(([name, value]) => ({ name, value: Number(value) || 0, fill: SERIES.deep }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [stats?.assigned_distribution]);

  const scheduleData = useMemo(() => {
    const map = stats?.schedule_status ?? {};
    return [
      { name: "Queued", value: map.PENDING ?? stats?.pending_schedules ?? 0, fill: SERIES.warning },
      { name: "Sent", value: map.SENT ?? stats?.sent_schedules ?? 0, fill: SERIES.success },
      { name: "Failed", value: map.FAILED ?? stats?.failed_schedules ?? 0, fill: SERIES.danger },
    ];
  }, [stats]);

  const timeline = useMemo(
    () =>
      (stats?.messages_timeline ?? []).map((d) => ({
        ...d,
        inbound: d.inbound ?? 0,
        outbound: d.outbound ?? 0,
        leads: d.leads ?? 0,
        label: tickDate(d.date),
      })),
    [stats?.messages_timeline],
  );

  const closed = stats?.stage_distribution?.Closed ?? 0;
  const total = stats?.total_leads ?? 0;
  const healthPct = total > 0 ? Math.round((closed / total) * 100) : 0;
  const pending = stats?.pending_schedules ?? 0;
  const unread = stats?.unread_total ?? 0;
  const failed = stats?.failed_schedules ?? 0;
  const inbound = stats?.inbound_messages ?? 0;
  const outbound = stats?.outbound_messages ?? 0;
  const replyRate = stats?.reply_rate ?? null;
  const chartHeight = isCompact ? 196 : 232;
  const periodLabel = formatRange(stats?.date_from, stats?.date_to);

  if (isPending && !stats) {
    return <BrandedLoader overlay className={cn("min-h-[min(60dvh,24rem)]", className)} />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Could not refresh analytics. Showing the last loaded numbers if available.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {unread > 0 && (
          <PendingChip label="Unread" value={unread} tone="info" icon={Inbox} onClick={() => onOpenInbox?.()} />
        )}
        {pending > 0 && (
          <PendingChip label="Queued sends" value={pending} tone="warning" icon={Calendar} onClick={onOpenScheduler} />
        )}
        {failed > 0 && (
          <PendingChip label="Failed sends" value={failed} tone="danger" icon={TriangleAlert} onClick={onOpenScheduler} />
        )}
        {(stats?.recent_leads ?? 0) > 0 && (
          <PendingChip label="New contacts" value={stats?.recent_leads ?? 0} tone="success" icon={Building2} onClick={onOpenContacts} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          {
            key: "contacts",
            label: "Contacts",
            value: stats?.total_leads ?? 0,
            icon: Building2,
            tone: "primary" as const,
            onClick: onOpenContacts,
            hint: stats?.recent_leads ? `${stats.recent_leads} new in period` : "No new contacts",
            delta: stats?.compare?.leads?.delta_pct,
          },
          {
            key: "messages",
            label: "Period messages",
            value: stats?.recent_messages ?? 0,
            icon: MessageSquare,
            tone: "info" as const,
            onClick: () => onOpenInbox?.(),
            hint: `${stats?.total_msgs ?? 0} all-time`,
            delta: stats?.compare?.messages?.delta_pct,
          },
          {
            key: "inbound",
            label: "Inbound",
            value: inbound,
            icon: Inbox,
            tone: "info" as const,
            onClick: () => onOpenInbox?.(),
            hint: `${stats?.media_messages ?? 0} with media`,
            delta: stats?.compare?.inbound?.delta_pct,
          },
          {
            key: "outbound",
            label: "Outbound",
            value: outbound,
            icon: Send,
            tone: "success" as const,
            hint: replyRate == null ? "No inbound to compare" : `${replyRate}% reply rate`,
            delta: stats?.compare?.outbound?.delta_pct,
          },
          {
            key: "unread",
            label: "Unread",
            value: unread,
            icon: Inbox,
            tone: unread > 0 ? ("warning" as const) : ("muted" as const),
            onClick: () => onOpenInbox?.(),
            hint: `${stats?.unread_chats ?? 0} chats waiting`,
          },
          {
            key: "reply",
            label: "Reply rate",
            value: replyRate ?? 0,
            icon: Reply,
            tone: replyRate != null && replyRate < 60 ? ("warning" as const) : ("success" as const),
            hint: replyRate == null ? "No inbound yet" : "Outbound / inbound",
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
            hint: `${stats?.sent_schedules ?? 0} sent · ${failed} failed`,
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

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-1.5">
          <Filter className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
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

        <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
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
          <p className="hidden text-[10px] tabular-nums text-muted-foreground md:block">
            {isFetching ? "Updating…" : periodLabel || `${total} contacts`}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 w-8 px-0" title="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 w-8 px-0" title="Export CSV">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {useCustomRange && (
        <div className="grid grid-cols-2 gap-1.5 sm:max-w-md">
          <DateField value={customFrom} onChange={setCustomFrom} placeholder="From" size="sm" />
          <DateField value={customTo} onChange={setCustomTo} placeholder="To" size="sm" min={customFrom} />
        </div>
      )}

      <div className="card-soft min-w-0 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversation volume</p>
            <p className="text-[10px] text-muted-foreground">{periodLabel || "Selected range"} · vs prior period</p>
          </div>
          <button
            type="button"
            onClick={() => setShowLeadsOnChart((v) => !v)}
            className={cn(
              "h-7 rounded-md border px-2 text-[10px] font-medium",
              showLeadsOnChart ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            New contacts
          </button>
        </div>
        {timeline.some((d) => d.count || d.leads) ? (
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timeline} margin={{ top: 8, right: 8, left: isCompact ? -22 : -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={20} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} width={isCompact ? 28 : 36} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                />
                {!isCompact ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
                {showLeadsOnChart ? (
                  <Bar dataKey="leads" name="New contacts" fill={SERIES.success} radius={[3, 3, 0, 0]} maxBarSize={18} />
                ) : null}
                <Line type="monotone" dataKey="inbound" name="Inbound" stroke={SERIES.deep} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey="outbound" name="Outbound" stroke={SERIES.primary} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart className="h-48" />
        )}
        {isCompact ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES.deep }} /> Inbound</span>
            <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES.primary }} /> Outbound</span>
            {showLeadsOnChart ? (
              <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES.success }} /> New contacts</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="card-soft min-w-0 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pipeline mix</p>
          {stageData.length > 0 ? (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stageData} dataKey="value" innerRadius={34} outerRadius={58} paddingAngle={2} stroke="none">
                      {stageData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {stageData.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStageFilter((prev) => (prev === s.name ? "All" : s.name))}
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
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">By owner</p>
          {assignedData.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assignedData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" fill={SERIES.deep} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </div>

        <div className="card-soft min-w-0 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sends</p>
          {scheduleData.some((s) => s.value) ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scheduleData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={28} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} className="cursor-pointer">
                    {scheduleData.map((row) => (
                      <Cell key={row.name} fill={row.fill} onClick={onOpenScheduler} />
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
          <div className="flex h-40 items-center gap-3">
            <HealthRing percent={replyRate ?? healthPct} label={replyRate == null ? "Closed" : "Reply"} />
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
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {unread > 0 ? `${unread} unread waiting` : "Inbox is clear"} · {pending} queued
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card-soft min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Busiest chats</p>
            <p className="text-[10px] text-muted-foreground">Most messages in this range</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onOpenInbox?.()}>
            Open inbox
          </Button>
        </div>
        {(stats?.top_chats ?? []).length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-muted-foreground">No chat activity in this range</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium sm:px-4">Contact</th>
                  <th className="px-2 py-2 font-medium">Stage</th>
                  <th className="px-2 py-2 text-right font-medium">Messages</th>
                  <th className="px-2 py-2 text-right font-medium">Unread</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Last</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.top_chats ?? []).map((chat) => (
                  <tr
                    key={chat.phone}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                    onClick={() => onOpenInbox?.(chat.phone)}
                  >
                    <td className="px-3 py-2 sm:px-4">
                      <p className="truncate font-medium">{chat.name}</p>
                      <p className="tabular-nums text-[10px] text-muted-foreground">{chat.phone}</p>
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill label={chat.stage || "New"} tone={stageTone(chat.stage)} className="text-[10px]" />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{chat.messages}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {chat.unread > 0 ? <span className="font-semibold text-success">{chat.unread}</span> : "0"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground sm:px-4">
                      {chat.last_at ? format(parseISO(chat.last_at), "d MMM, h:mm a") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function stageTone(stage?: string) {
  switch (stage?.toLowerCase()) {
    case "hot":
      return "warning" as const;
    case "closed":
      return "success" as const;
    case "cold":
      return "danger" as const;
    case "follow-up":
      return "info" as const;
    default:
      return "info" as const;
  }
}

function EmptyChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-40 flex-col items-center justify-center gap-1 text-center", className)}>
      <p className="text-xs text-muted-foreground">No data in this range</p>
    </div>
  );
}

function HealthRing({ percent, label }: { percent: number; label: string }) {
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
      <text x="32" y="31" textAnchor="middle" className="fill-foreground text-[11px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
        {percent}%
      </text>
      <text x="32" y="42" textAnchor="middle" className="fill-muted-foreground text-[7px] uppercase">
        {label}
      </text>
    </svg>
  );
}
