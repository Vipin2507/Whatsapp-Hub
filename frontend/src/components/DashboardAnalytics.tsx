import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DashboardStatsParams } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  Users,
  MessageSquare,
  Calendar,
  Layers,
  Loader2,
  Activity,
  Filter,
  RefreshCw,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

const COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  emerald: "#10b981",
  indigo: "#6366f1",
  amber: "#f59e0b",
  rose: "#ef4444",
  orange: "#f97316",
};

const STAGE_COLORS: Record<string, string> = {
  New: COLORS.primary,
  "Follow-up": COLORS.indigo,
  Hot: COLORS.orange,
  Cold: COLORS.secondary,
  Closed: COLORS.emerald,
};

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

const STAGES = ["All", "New", "Follow-up", "Hot", "Cold", "Closed"];

interface DashboardAnalyticsProps {
  className?: string;
}

export function DashboardAnalytics({ className }: DashboardAnalyticsProps) {
  const [datePreset, setDatePreset] = useState<number>(7);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [useCustomRange, setUseCustomRange] = useState(false);

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

  const {
    data: stats,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-stats", params],
    queryFn: () => api.dashboard.getStats(params),
    refetchInterval: 60000,
  });

  const handleExportCSV = () => {
    if (!stats?.messages_timeline?.length) {
      toast.info("No timeline data to export");
      return;
    }
    const headers = "Date,Messages\n";
    const rows = stats.messages_timeline
      .map((d) => `${d.date},${d.count}`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-messages-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  const dateRangeLabel = useMemo(() => {
    if (stats?.date_from && stats?.date_to) {
      const from = format(new Date(stats.date_from), "MMM d, yyyy");
      const to = format(new Date(stats.date_to), "MMM d, yyyy");
      return `${from} – ${to}`;
    }
    return `${datePreset} days`;
  }, [stats?.date_from, stats?.date_to, datePreset]);

  const stageData = useMemo(() => {
    if (!stats?.stage_distribution) return [];
    return Object.entries(stats.stage_distribution).map(([name, value]) => ({
      name,
      value,
      fill: STAGE_COLORS[name] || COLORS.primary,
    }));
  }, [stats?.stage_distribution]);

  const messagesTimeline = stats?.messages_timeline ?? [];

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-16", className)}>
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Filter bar */}
      <Card className="border-border/50 bg-card/50 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Filters</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:flex-wrap sm:items-end">
            {/* Date range: presets or custom */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Date range</span>
              <Select
                value={useCustomRange ? "custom" : String(datePreset)}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setUseCustomRange(true);
                    const to = new Date();
                    const from = subDays(to, 7);
                    setCustomFrom(format(from, "yyyy-MM-dd"));
                    setCustomTo(format(to, "yyyy-MM-dd"));
                  } else {
                    setUseCustomRange(false);
                    setDatePreset(Number(v));
                  }
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.days} value={String(p.days)}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {useCustomRange && (
                <>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-[140px]"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-[140px]"
                  />
                </>
              )}
            </div>
            {/* Stage filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Stage</span>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground sm:ml-2">
              Showing: {dateRangeLabel}
              {stageFilter !== "All" && ` · Stage: ${stageFilter}`}
            </p>
          </div>
        </CardHeader>
      </Card>

      {/* KPI cards */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Overview
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/50 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Contacts
              </CardTitle>
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_leads ?? 0}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats?.recent_leads != null && stats.recent_leads > 0 ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="h-3 w-3" />
                    {stats.recent_leads} in period
                  </span>
                ) : (
                  "In selected period"
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Messages Sent
              </CardTitle>
              <div className="rounded-lg bg-indigo-500/10 p-2">
                <MessageSquare className="h-4 w-4 text-indigo-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {stats?.total_msgs ?? 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats?.recent_messages != null && stats.recent_messages > 0 ? (
                  <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                    <Activity className="h-3 w-3" />
                    {stats.recent_messages} in period
                  </span>
                ) : (
                  "In selected period"
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lists
              </CardTitle>
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <Layers className="h-4 w-4 text-emerald-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats?.total_segments ?? 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Contact lists</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Schedules
              </CardTitle>
              <div className="rounded-lg bg-amber-500/10 p-2">
                <Calendar className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {stats?.pending_schedules ?? 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Queued messages</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Charts
        </h3>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Message Activity</CardTitle>
              <p className="text-xs text-muted-foreground">Messages sent over time</p>
            </CardHeader>
            <CardContent>
              {messagesTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={messagesTimeline}>
                    <defs>
                      <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: 11 }}
                      tickFormatter={(v) => format(new Date(v), "MMM d")}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                      labelFormatter={(v) => format(new Date(v), "PPP")}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={COLORS.indigo}
                      fillOpacity={1}
                      fill="url(#colorMessages)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
                  No message data for this period
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Contacts by stage</CardTitle>
              <p className="text-xs text-muted-foreground">Pipeline distribution</p>
            </CardHeader>
            <CardContent>
              {stageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={stageData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {stageData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
                  No stage data
                  {stageFilter !== "All" && " for selected stage"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {stageData.length > 0 && (
          <Card className="mt-6 border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Stage breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stageData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" style={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {stageData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
