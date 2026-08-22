import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Loader2,
  Search,
  Shield,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { api, type AdminUser, type WahaSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageWrap } from "@/components/PageWrap";
import { StatusPill } from "@/components/PendingChip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TeamViewProps {
  isAdmin?: boolean;
  onOpenSessions?: () => void;
}

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function isRootAdmin(username: string) {
  return username.toLowerCase().trim() === "admin";
}

function sessionTone(status?: string) {
  const value = (status || "").toUpperCase();
  if (value === "CONNECTED" || value === "ONLINE" || value === "WORKING") return "success" as const;
  if (value === "SCAN_QR_CODE" || value === "STARTING") return "warning" as const;
  if (value === "FAILED") return "danger" as const;
  return "muted" as const;
}

export function TeamView({ isAdmin, onOpenSessions }: TeamViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.admin.listUsers,
    enabled: Boolean(isAdmin),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["waha-sessions"],
    queryFn: api.waha.listSessions,
    enabled: Boolean(isAdmin),
    refetchInterval: 10000,
  });

  const sessionByName = useMemo(() => {
    const map = new Map<string, WahaSession>();
    sessions.forEach((s) => map.set(s.name, s));
    return map;
  }, [sessions]);

  const filtered = users.filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      user.username.toLowerCase().includes(q) ||
      (user.assigned_session || "").toLowerCase().includes(q)
    );
  });

  const assignedCount = users.filter((u) => u.assigned_session).length;

  const createMutation = useMutation({
    mutationFn: () => api.admin.createUser({ username: newUsername.trim(), password: newPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setNewUsername("");
      setNewPassword("");
      toast.success("Operator created");
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ userId, session }: { userId: number; session: string }) =>
      api.admin.setUserDefaultSession(userId, session),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      toast.success("Session assigned");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.admin.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Operator removed");
    },
    onError: () => toast.error("Could not remove operator"),
  });

  const handleCreate = () => {
    if (!newUsername.trim()) return toast.error("Username is required");
    if (newPassword.length < 6) return toast.error("Password must be at least 6 characters");
    createMutation.mutate();
  };

  if (!isAdmin) {
    return (
      <PageWrap className="max-w-3xl">
        <PageHeader title="Team" subtitle="Operators and WhatsApp session assignment" />
        <div className="card-soft flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Admin only</p>
          <p className="text-xs text-muted-foreground">Ask an admin to add operators and assign sessions.</p>
        </div>
      </PageWrap>
    );
  }

  return (
    <PageWrap className="max-w-5xl">
      <PageHeader
        title="Team"
        subtitle={`${users.length} operator${users.length === 1 ? "" : "s"} · ${assignedCount} with a session`}
        actions={
          onOpenSessions ? (
            <Button variant="outline" size="sm" className="h-8" onClick={onOpenSessions}>
              <Smartphone className="h-3.5 w-3.5" />
              Sessions
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              New operator
            </h3>
          </div>
          <div className="card-soft space-y-3 p-4">
            <div className="space-y-1">
              <label className={fieldLabel}>Username</label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="agent_01"
                className="h-9"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <label className={fieldLabel}>Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="h-9 pr-9"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <Button
              className="h-9 w-full"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newUsername.trim() || newPassword.length < 6}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Create operator
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              New accounts can sign in immediately. Assign a WhatsApp session so they can send messages.
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search operators"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <p className="ml-auto text-[11px] text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{filtered.length}</span>
              {" of "}
              <span className="font-medium tabular-nums text-foreground">{users.length}</span>
            </p>
          </div>

          {isLoading ? (
            <div className="card-soft flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading team
            </div>
          ) : filtered.length === 0 ? (
            <div className="card-soft flex flex-col items-center justify-center gap-1 py-16 text-center">
              <Users className="mb-1 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No operators found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((user: AdminUser) => {
                const root = isRootAdmin(user.username);
                const session = user.assigned_session ? sessionByName.get(user.assigned_session) : undefined;
                return (
                  <div key={user.id} className="card-soft p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                        {user.username.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-sm font-medium">{user.username}</h3>
                          <StatusPill label={root ? "Admin" : "Operator"} tone={root ? "info" : "muted"} />
                          {user.assigned_session ? (
                            <StatusPill
                              label={user.assigned_session}
                              tone={sessionTone(session?.status)}
                            />
                          ) : (
                            <StatusPill label="No session" tone="warning" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {root
                            ? "Cannot be deleted. Uses the workspace default session."
                            : session?.status
                              ? `Session ${session.status.toLowerCase()}`
                              : "Assign a WhatsApp session to enable sending."}
                        </p>
                      </div>
                    </div>

                    {!root ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
                        <Select
                          value={user.assigned_session || undefined}
                          onValueChange={(session) => assignMutation.mutate({ userId: user.id, session })}
                          disabled={assignMutation.isPending || sessions.length === 0}
                        >
                          <SelectTrigger className={cn("h-8 w-full max-w-[220px] text-xs", !user.assigned_session && "text-muted-foreground")}>
                            <SelectValue placeholder={sessions.length === 0 ? "No sessions yet" : "Assign session"} />
                          </SelectTrigger>
                          <SelectContent className="z-[200]">
                            {sessions.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-muted-foreground">Create a session first.</div>
                            ) : (
                              sessions.map((s) => (
                                <SelectItem key={s.name} value={s.name}>
                                  {s.name}
                                  {s.status ? ` · ${s.status}` : ""}
                                </SelectItem>
                              ))
                            )}
                            {user.assigned_session && !sessions.some((s) => s.name === user.assigned_session) ? (
                              <SelectItem value={user.assigned_session}>{user.assigned_session}</SelectItem>
                            ) : null}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`Remove operator “${user.username}”? They will lose access immediately.`)) {
                              deleteMutation.mutate(user.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageWrap>
  );
}
