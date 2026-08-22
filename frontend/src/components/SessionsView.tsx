import { useState } from "react";
import {
  ChevronLeft,
  Loader2,
  Plus,
  Play,
  Square,
  RefreshCw,
  Trash2,
  Star,
  QrCode,
  Smartphone,
  X,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, WahaSession } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isWahaLive, normalizeWahaStatus } from "@/lib/waha-status";

interface SessionsViewProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSessionName: string;
}

export function SessionsView({ isOpen, onClose, defaultSessionName }: SessionsViewProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);
  const [qrSession, setQrSession] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["waha-sessions"],
    queryFn: api.waha.listSessions,
    enabled: isOpen,
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.waha.createSession({
        ...(newSessionName.trim() && { name: newSessionName.trim() }),
        start: startImmediately,
      }),
    onSuccess: (data: WahaSession) => {
      queryClient.invalidateQueries({ queryKey: ["waha-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      setCreateOpen(false);
      setNewSessionName("");
      setStartImmediately(true);
      if (data?.status === "SCAN_QR_CODE") setQrSession(data.name);
      toast.success("Session created");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Create session failed");
    },
  });

  const startMutation = useMutation({
    mutationFn: (name: string) => api.waha.startSession(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["waha-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      setQrSession(name);
      toast.success("Session starting");
    },
    onError: (e: Error) => toast.error(e.message || "Start failed"),
  });

  const stopMutation = useMutation({
    mutationFn: (name: string) => api.waha.stopSession(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waha-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      setQrSession(null);
      toast.success("Session stopped");
    },
    onError: (e: Error) => toast.error(e.message || "Stop failed"),
  });

  const restartMutation = useMutation({
    mutationFn: (name: string) => api.waha.restartSession(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waha-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      toast.success("Session restarting");
    },
    onError: (e: Error) => toast.error(e.message || "Restart failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.waha.deleteSession(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waha-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      setQrSession(null);
      toast.success("Session deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (name: string) => api.waha.setDefaultSession(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      toast.success(`Default session set to "${name}"`);
    },
    onError: (e: Error) => toast.error(e.message || "Set default failed"),
  });

  const statusColor = (status?: string) => {
    const s = normalizeWahaStatus(status);
    if (isWahaLive(s)) return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    if (s === "SCAN_QR_CODE" || s === "STARTING") return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30";
    if (s === "STOPPED" || s === "FAILED") return "bg-muted text-muted-foreground border-border";
    return "bg-muted/80 text-muted-foreground border-border";
  };

  if (!isOpen) return null;

  return (
    <div
      className="app-overlay z-40"
    >
      <header className="app-overlay-header justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">WhatsApp Sessions</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Default: {defaultSessionName}</span>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Smartphone className="h-12 w-12 mb-4 opacity-50" />
            <p className="font-medium">No sessions yet</p>
            <p className="text-sm mt-1">Create a session to link a WhatsApp number. WAHA Plus supports unlimited sessions.</p>
            <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create session
            </Button>
          </div>
        ) : (
          <div className="table-scroll">
          <div className="min-w-[720px] lg:min-w-0">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 grid grid-cols-12 gap-2 px-2 py-2 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Engine</div>
              <div className="col-span-1">Default</div>
              <div className="col-span-4">Actions</div>
            </div>
            {sessions.map((s) => (
              <div
                key={s.name}
                className="col-span-12 grid grid-cols-12 gap-2 items-center px-3 py-3 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50"
              >
                <div className="col-span-3 font-medium truncate">{s.name}</div>
                <div className="col-span-2">
                  <Badge variant="outline" className={cn("text-xs", statusColor(s.status))}>
                    {s.status ?? "—"}
                  </Badge>
                </div>
                <div className="col-span-2 text-sm text-muted-foreground">
                  {s.engine?.engine ?? "—"}
                </div>
                <div className="col-span-1">
                  {s.name === defaultSessionName ? (
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" title="Default session" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="col-span-4 flex flex-wrap items-center gap-1">
                  {(s.status === "STOPPED" || s.status === "FAILED" || !s.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={startMutation.isPending}
                      onClick={() => startMutation.mutate(s.name)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  )}
                  {(isWahaLive(s.status) || s.status === "SCAN_QR_CODE" || s.status === "STARTING") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={stopMutation.isPending}
                      onClick={() => stopMutation.mutate(s.name)}
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  )}
                  {isWahaLive(s.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={restartMutation.isPending}
                      onClick={() => restartMutation.mutate(s.name)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Restart
                    </Button>
                  )}
                  {(s.status === "SCAN_QR_CODE" || s.status === "STARTING") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setQrSession(qrSession === s.name ? null : s.name)}
                    >
                      <QrCode className="h-3 w-3 mr-1" />
                      QR
                    </Button>
                  )}
                  {s.name !== defaultSessionName && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      disabled={setDefaultMutation.isPending}
                      onClick={() => setDefaultMutation.mutate(s.name)}
                      title="Set as default (used for sending/receiving)"
                    >
                      <Star className="h-3 w-3 mr-1" />
                      Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete session "${s.name}"? You will need to scan QR again to reuse this name.`)) {
                        deleteMutation.mutate(s.name);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {qrSession === s.name && (s.status === "SCAN_QR_CODE" || s.status === "STARTING") && (
                  <div className="col-span-12 mt-2 p-4 bg-muted/30 rounded-lg flex flex-col items-center">
                    <p className="text-sm text-muted-foreground mb-2">Scan with WhatsApp on your phone</p>
                    <img
                      src={`${api.waha.getQrUrl(s.name)}?t=${Date.now()}`}
                      alt="QR code"
                      className="w-48 h-48 object-contain border border-border rounded"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          </div>
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create session</DialogTitle>
            <DialogDescription>
              Create a new WAHA session. Optionally set a name; otherwise one will be generated. The session can be started now or later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Session name (optional)</label>
              <Input
                placeholder="e.g. default, support, sales"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="start-now"
                checked={startImmediately}
                onChange={(e) => setStartImmediately(e.target.checked)}
              />
              <label htmlFor="start-now" className="text-sm">Start immediately (show QR to link WhatsApp)</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
