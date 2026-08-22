import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  User,
  Palette,
  Smartphone,
  MessageSquare,
  Bell,
  Globe,
  Shield,
  Info,
  LogOut,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Zap,
  Monitor,
  Sun,
  Moon,
  KeyRound,
  ExternalLink,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageWrap } from "@/components/PageWrap";
import { StatusPill } from "@/components/PendingChip";
import { beginThemeTransition } from "@/lib/theme";
import { DEFAULT_PREFERENCES, useAppSettings } from "@/hooks/use-app-settings";
import { wahaHealth } from "@/lib/waha-status";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SectionId =
  | "account"
  | "appearance"
  | "whatsapp"
  | "messaging"
  | "notifications"
  | "workspace"
  | "team"
  | "about";

interface SettingsViewProps {
  isAdmin?: boolean;
  onLogout: () => void;
  onOpenOperators?: () => void;
  onOpenSessions?: () => void;
  onOpenHelp?: () => void;
}

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

const COUNTRY_CODES = [
  { code: "91", label: "India (+91)" },
  { code: "1", label: "US / Canada (+1)" },
  { code: "44", label: "United Kingdom (+44)" },
  { code: "234", label: "Nigeria (+234)" },
  { code: "971", label: "United Arab Emirates (+971)" },
  { code: "966", label: "Saudi Arabia (+966)" },
  { code: "92", label: "Pakistan (+92)" },
  { code: "880", label: "Bangladesh (+880)" },
  { code: "254", label: "Kenya (+254)" },
  { code: "27", label: "South Africa (+27)" },
];

function chipClass(active: boolean) {
  return cn(
    "h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium",
    active
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
  );
}

export function SettingsView({
  isAdmin,
  onLogout,
  onOpenOperators,
  onOpenSessions,
  onOpenHelp,
}: SettingsViewProps) {
  const queryClient = useQueryClient();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [section, setSection] = useState<SectionId>("account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const { data: settings, isLoading } = useAppSettings();
  const prefs = settings?.preferences ?? DEFAULT_PREFERENCES;
  const username = settings?.user.username ?? "—";
  const role = settings?.user.is_admin || isAdmin ? "Admin" : "Operator";
  const defaultSession = settings?.whatsapp.default_session ?? "default";
  const aiEnabled = settings?.user.ai_enabled ?? false;

  const { data: wahaStatus } = useQuery({
    queryKey: ["waha-status"],
    queryFn: api.dashboard.getStatus,
    refetchInterval: 8000,
  });
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.dashboard.getStats({ days: 7 }),
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["waha-sessions"],
    queryFn: api.waha.listSessions,
    enabled: Boolean(isAdmin),
  });
  const { data: operators = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.admin.listUsers,
    enabled: Boolean(isAdmin),
  });

  const activeSession = (wahaStatus?.sessions ?? []).find((s) => s.name === defaultSession);
  const connection = wahaHealth(activeSession?.status);
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
    } catch {
      return "Local";
    }
  }, []);

  const nav = [
    { id: "account" as const, label: "Account", icon: User },
    { id: "appearance" as const, label: "Appearance", icon: Palette },
    { id: "whatsapp" as const, label: "WhatsApp", icon: Smartphone },
    { id: "messaging" as const, label: "Messaging", icon: MessageSquare },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "workspace" as const, label: "Workspace", icon: Globe },
    ...(isAdmin ? [{ id: "team" as const, label: "Team", icon: Shield }] : []),
    { id: "about" as const, label: "About", icon: Info },
  ];

  const passwordMutation = useMutation({
    mutationFn: () => api.auth.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    },
  });

  const prefsMutation = useMutation({
    mutationFn: (data: Partial<typeof prefs>) => api.settings.updatePreferences(data),
    onSuccess: (res) => {
      queryClient.setQueryData(["app-settings"], (prev: typeof settings) =>
        prev ? { ...prev, preferences: res.preferences } : prev,
      );
      toast.success("Saved");
    },
  });

  const autoReplyMutation = useMutation({
    mutationFn: (enabled: boolean) => api.settings.setAutoReply(enabled),
    onSuccess: (res) => {
      queryClient.setQueryData(["app-settings"], (prev: typeof settings) =>
        prev ? { ...prev, user: { ...prev.user, ai_enabled: res.ai_enabled } } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success(res.ai_enabled ? "Auto-reply on" : "Auto-reply off");
    },
  });

  const sessionMutation = useMutation({
    mutationFn: (session: string) => api.waha.setDefaultSession(session),
    onSuccess: (res: { session?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      toast.success(`Default session: ${res.session || "updated"}`);
    },
  });

  const savePassword = () => {
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters");
    if (newPassword !== confirmPassword) return toast.error("New passwords do not match");
    passwordMutation.mutate();
  };

  return (
    <PageWrap className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Account, WhatsApp, and workspace preferences" />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:w-44 lg:shrink-0 lg:flex-col">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium",
                  section === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-3">
          {isLoading ? (
            <div className="card-soft flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading settings
            </div>
          ) : null}

          {section === "account" && (
            <>
              <section className="card-soft space-y-3 p-4">
                <h3 className="text-sm font-semibold tracking-tight">Profile</h3>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                    {username.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{username}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusPill label={role} tone={role === "Admin" ? "info" : "muted"} />
                      <StatusPill label={connection.label} tone={connection.tone} />
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className={fieldLabel}>Username</p>
                    <p className="mt-0.5 text-sm font-medium">{username}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className={fieldLabel}>User ID</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">{settings?.user.id ?? "—"}</p>
                  </div>
                </div>
              </section>

              <section className="card-soft space-y-3 p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  Password
                </h3>
                <p className="text-xs text-muted-foreground">Change the password for this operator account.</p>
                <div className="space-y-1">
                  <label className={fieldLabel}>Current password</label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="h-9 pr-9"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowCurrent((v) => !v)}
                      aria-label={showCurrent ? "Hide password" : "Show password"}
                    >
                      {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={fieldLabel}>New password</label>
                    <div className="relative">
                      <Input
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-9 pr-9"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                        onClick={() => setShowNew((v) => !v)}
                        aria-label={showNew ? "Hide password" : "Show password"}
                      >
                        {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={fieldLabel}>Confirm new password</label>
                    <Input
                      type={showNew ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-9"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <Button
                  className="h-9"
                  onClick={savePassword}
                  disabled={passwordMutation.isPending || !currentPassword || !newPassword}
                >
                  {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Update password
                </Button>
              </section>

              <section className="card-soft flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Sign out</h3>
                  <p className="text-xs text-muted-foreground">End this session on this browser.</p>
                </div>
                <Button variant="destructive" className="h-9" onClick={onLogout}>
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </Button>
              </section>
            </>
          )}

          {section === "appearance" && (
            <section className="card-soft space-y-3 p-4">
              <h3 className="text-sm font-semibold tracking-tight">Theme</h3>
              <p className="text-xs text-muted-foreground">Applies to this browser. System follows your OS setting.</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["light", "Light", Sun],
                    ["dark", "Dark", Moon],
                    ["system", "System", Monitor],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      beginThemeTransition();
                      setTheme(value);
                    }}
                    className={chipClass((theme ?? "system") === value)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Currently showing <span className="font-medium text-foreground">{resolvedTheme ?? "light"}</span> theme.
              </p>
            </section>
          )}

          {section === "whatsapp" && (
            <>
              <section className="card-soft space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Connection</h3>
                    <p className="text-xs text-muted-foreground">Session used for inbox, send, and scheduler.</p>
                  </div>
                  <StatusPill label={connection.label} tone={connection.tone} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className={fieldLabel}>Default session</p>
                    <p className="mt-0.5 truncate text-sm font-medium">{defaultSession}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className={fieldLabel}>Linked number</p>
                    <p className="mt-0.5 truncate text-sm font-medium">
                      {activeSession?.me?.id?.replace("@c.us", "") || activeSession?.me?.name || "Not linked"}
                    </p>
                  </div>
                </div>
                {isAdmin ? (
                  <div className="space-y-1">
                    <label className={fieldLabel}>Assign default session</label>
                    <div className="flex gap-2">
                      <Select
                        value={defaultSession}
                        onValueChange={(value) => sessionMutation.mutate(value)}
                        disabled={sessionMutation.isPending || sessions.length === 0}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Choose session" />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          {sessions.map((s) => (
                            <SelectItem key={s.name} value={s.name}>
                              {s.name}
                              {s.status ? ` · ${s.status}` : ""}
                            </SelectItem>
                          ))}
                          {defaultSession && !sessions.some((s) => s.name === defaultSession) ? (
                            <SelectItem value={defaultSession}>{defaultSession}</SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">An admin assigns your WhatsApp session from Team.</p>
                )}
                {onOpenSessions && isAdmin ? (
                  <Button variant="outline" className="h-9" onClick={onOpenSessions}>
                    <Smartphone className="h-3.5 w-3.5" />
                    Manage sessions
                  </Button>
                ) : null}
              </section>
            </>
          )}

          {section === "messaging" && (
            <section className="card-soft divide-y">
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    Auto-reply
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Let the assistant answer incoming WhatsApp messages for this account.
                  </p>
                </div>
                <Switch
                  checked={aiEnabled}
                  disabled={autoReplyMutation.isPending}
                  onCheckedChange={(checked) => autoReplyMutation.mutate(checked)}
                />
              </div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">Enter to send</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Press Enter to send in inbox. Shift+Enter always inserts a new line.
                  </p>
                </div>
                <Switch
                  checked={prefs.enter_to_send}
                  disabled={prefsMutation.isPending}
                  onCheckedChange={(checked) => prefsMutation.mutate({ enter_to_send: checked })}
                />
              </div>
            </section>
          )}

          {section === "notifications" && (
            <section className="card-soft space-y-3 p-4">
              <h3 className="text-sm font-semibold tracking-tight">Alerts</h3>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Pending schedule badge</p>
                  <p className="text-xs text-muted-foreground">
                    Show a dot on the bell when messages are waiting to send.
                    {typeof stats?.pending_schedules === "number" ? ` ${stats.pending_schedules} pending now.` : ""}
                  </p>
                </div>
                <Switch
                  checked={prefs.notify_pending_schedules}
                  disabled={prefsMutation.isPending}
                  onCheckedChange={(checked) => prefsMutation.mutate({ notify_pending_schedules: checked })}
                />
              </div>
            </section>
          )}

          {section === "workspace" && (
            <section className="card-soft space-y-3 p-4">
              <h3 className="text-sm font-semibold tracking-tight">Defaults</h3>
              <div className="space-y-1">
                <label className={fieldLabel}>Default country code</label>
                <Select
                  value={prefs.default_country_code}
                  onValueChange={(value) => prefsMutation.mutate({ default_country_code: value })}
                >
                  <SelectTrigger className="h-9 max-w-sm text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {COUNTRY_CODES.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.label}
                      </SelectItem>
                    ))}
                    {!COUNTRY_CODES.some((item) => item.code === prefs.default_country_code) ? (
                      <SelectItem value={prefs.default_country_code}>Custom (+{prefs.default_country_code})</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Used when a contact or schedule is entered as a 10-digit local number.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className={fieldLabel}>Timezone</p>
                  <p className="mt-0.5 truncate text-sm font-medium">{timezone}</p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className={fieldLabel}>Contacts</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">{stats?.total_leads ?? "—"}</p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className={fieldLabel}>Pending sends</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">{stats?.pending_schedules ?? "—"}</p>
                </div>
              </div>
            </section>
          )}

          {section === "team" && isAdmin && (
            <section className="card-soft space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Operators</h3>
                  <p className="text-xs text-muted-foreground">Accounts that can sign in to this workspace.</p>
                </div>
                {onOpenOperators ? (
                  <Button size="sm" className="h-8" onClick={onOpenOperators}>
                    <Users className="h-3.5 w-3.5" />
                    Open team
                  </Button>
                ) : null}
              </div>
              {operators.length === 0 ? (
                <p className="text-xs text-muted-foreground">No operators loaded.</p>
              ) : (
                <div className="space-y-1.5">
                  {operators.map((op) => (
                    <div key={op.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{op.username}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {op.assigned_session || "No session assigned"}
                        </p>
                      </div>
                      <StatusPill
                        label={op.username.toLowerCase() === "admin" ? "Admin" : "Operator"}
                        tone={op.username.toLowerCase() === "admin" ? "info" : "muted"}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === "about" && (
            <section className="card-soft space-y-3 p-4">
              <h3 className="text-sm font-semibold tracking-tight">Buildesk</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                WhatsApp operations console for inbox, contacts, templates, scheduler, and call analysis.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className={fieldLabel}>Product</p>
                  <p className="mt-0.5 text-sm font-medium">Buildesk Hub</p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className={fieldLabel}>Workspace stats (7d)</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {stats?.total_msgs ?? 0} messages · {stats?.total_leads ?? 0} contacts
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {onOpenHelp ? (
                  <Button variant="outline" className="h-9" onClick={onOpenHelp}>
                    Help
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </div>
    </PageWrap>
  );
}
