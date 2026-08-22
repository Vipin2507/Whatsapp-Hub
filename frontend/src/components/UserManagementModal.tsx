import { useState } from "react";
import { Users, Trash2, ShieldCheck, Loader2, UserPlus, Fingerprint, Smartphone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AdminUser } from "@/lib/api";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreate: () => void;
}

export function UserManagementModal({ isOpen, onClose, onOpenCreate }: UserManagementModalProps) {
  const queryClient = useQueryClient();
  const [selectedSessionByUser, setSelectedSessionByUser] = useState<Record<number, string>>({});

  // --- 1. HARDENED ROLE CHECK ---
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: api.auth.getMe,
    staleTime: 5000,
    enabled: isOpen,
  });

  const isAdmin = currentUser?.user?.username?.toLowerCase().trim() === "admin";

  // --- FETCH ALL USERS ---
  const { data: users = [], isLoading: isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.admin.listUsers,
    enabled: isOpen && !userLoading && isAdmin,
  });

  // --- FETCH WAHA SESSIONS (admin only, for assignment) ---
  const { data: wahaSessions = [] } = useQuery({
    queryKey: ["waha-sessions"],
    queryFn: api.waha.listSessions,
    enabled: isOpen && isAdmin,
  });

  // --- DELETE MUTATION ---
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.admin.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Operator access revoked");
    },
    onError: () => toast.error("Database Error: Failed to purge record"),
  });

  // --- ASSIGN SESSION MUTATION ---
  const assignSessionMutation = useMutation({
    mutationFn: ({ userId, session }: { userId: number; session: string }) =>
      api.admin.setUserDefaultSession(userId, session),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["waha-status"] });
      toast.success("WhatsApp session assigned");
    },
    onError: (e: Error) => toast.error(e.message || "Assign session failed"),
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-background border-border text-foreground rounded-[2.5rem] max-w-2xl shadow-2xl transition-colors duration-500">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 glow-primary">
              <Fingerprint className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">
                Authority Matrix
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                {isAdmin ? "Manage system operators and encryption levels" : "Authorized personnel list"}
              </DialogDescription>
            </div>
          </div>

          {/* 2. PROTECTED ACTION: Only visible if normalized username is 'admin' */}
          {isAdmin && (
            <Button 
              onClick={onOpenCreate} 
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase px-4 h-9 shadow-lg shadow-primary/20 transition-all active:scale-95 animate-in fade-in zoom-in"
            >
              <UserPlus className="w-3.5 h-3.5 mr-2" /> Initialize Operator
            </Button>
          )}
        </DialogHeader>

        <div className="py-6 min-h-[300px] max-h-[500px] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Synchronizing Matrix...</p>
            </div>
          ) : !isAdmin ? (
             <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <Users className="w-12 h-12 text-muted-foreground/20" />
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Restricted Access: Elevated Privileges Required</p>
             </div>
          ) : (
            <div className="space-y-2">
              {users.map((user: AdminUser) => (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-secondary/20 border border-border/40 rounded-2xl group hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-[10px] font-black uppercase text-foreground border border-border">
                      {user.username.substring(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground tracking-tight">{user.username}</h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[8px] font-black uppercase px-2 py-0 border-none",
                            user.username.toLowerCase() === "admin"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {user.username.toLowerCase() === "admin" ? "System Root" : "Operator"}
                        </Badge>
                        {user.assigned_session && (
                          <Badge variant="outline" className="text-[8px] px-2 py-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <Smartphone className="w-2.5 h-2.5 mr-1" />
                            {user.assigned_session}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Assign WAHA session (for non-admin users) */}
                    {user.username.toLowerCase() !== "admin" && (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={selectedSessionByUser[user.id] ?? user.assigned_session ?? ""}
                          onValueChange={(v) =>
                            setSelectedSessionByUser((prev) => ({ ...prev, [user.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue
                              placeholder={
                                wahaSessions.length === 0
                                  ? "No sessions yet"
                                  : "Select session"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="z-[200]" style={{ zIndex: 9999 }}>
                            {wahaSessions.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                                Create a WAHA session first.
                              </div>
                            ) : (
                              wahaSessions.map((s: { name: string }) => (
                                <SelectItem key={s.name} value={s.name}>
                                  {s.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-[10px]"
                          disabled={assignSessionMutation.isPending || wahaSessions.length === 0}
                          onClick={() => {
                            const session =
                              selectedSessionByUser[user.id] ?? user.assigned_session ?? "";
                            if (session)
                              assignSessionMutation.mutate({ userId: user.id, session });
                            else toast.error("Select a session first");
                          }}
                        >
                          {assignSessionMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Assign"
                          )}
                        </Button>
                      </div>
                    )}
                    {isAdmin && user.username.toLowerCase() !== "admin" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(user.id)}
                        disabled={deleteMutation.isPending}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors h-8 w-8"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Badge className="bg-emerald/10 text-emerald border-none">
                      <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}