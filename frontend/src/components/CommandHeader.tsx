import { Search, Settings, Bell, LayoutTemplate, Calendar, MessageSquare, LogOut, Layers, Zap, Power, Database } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CommandHeaderProps {
  onOpenTemplates: () => void;
  onOpenScheduler: () => void;
  onOpenListManager: () => void;
  onOpenManageContacts: () => void; // TACTICAL: New prop for Registry
}

export function CommandHeader({ 
  onOpenTemplates, 
  onOpenScheduler, 
  onOpenListManager, 
  onOpenManageContacts 
}: CommandHeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- 1. FETCH CURRENT AUTO-PILOT STATUS ---
  const { data: currentUser } = useQuery({ 
    queryKey: ["current-user"], 
    queryFn: api.auth.getMe 
  });

  const aiEnabled = currentUser?.user?.ai_enabled || false;

  // --- 2. TOGGLE MUTATION ---
  const toggleAiMutation = useMutation({
    mutationFn: () => api.request("/admin/toggle-ai", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      
      if (data.ai_enabled) {
        toast.success("AI Sentry Protocol: GLOBAL AUTO-REPLY ENGAGED", {
          description: "Gemini AI is now managing incoming transmissions.",
          className: "bg-emerald/10 border-emerald/20 text-emerald font-black"
        });
      } else {
        toast.warning("AI Sentry Protocol: OFFLINE", {
          description: "Manual response mode restored.",
        });
      }
    },
    onError: () => {
      toast.error("System Override Failed: Check Matrix Connection");
    }
  });

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      toast.success("Secure Session Terminated");
      navigate("/login");
    } catch (error) {
      navigate("/login");
    }
  };

  return (
    <header className="h-16 bg-gradient-to-r from-card/80 via-card/60 to-card/80 backdrop-blur-xl border-b border-border/50 px-6 flex items-center justify-between gap-4 transition-colors duration-500 shadow-sm">
      
      {/* BRAND & API STATUS */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-105">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-foreground tracking-tight">Buildesk</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Command Center</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">WAHA Node Linked</span>
        </div>
      </div>

      {/* SEARCH INTERFACE */}
      <div className="flex-1 max-w-sm hidden lg:block">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Search leads or commands..."
            className="pl-10 h-10 bg-gradient-to-r from-secondary/30 to-secondary/20 border-border/50 focus:bg-background focus:border-primary/50 rounded-xl text-xs transition-all shadow-sm hover:shadow-md"
          />
        </div>
      </div>

      {/* TACTICAL ACTIONS */}
      <div className="flex items-center gap-4">
        
        {/* AUTO-PILOT TOGGLE */}
        <div className={cn(
          "hidden md:flex items-center gap-3 px-4 py-2 rounded-xl border backdrop-blur-sm transition-all duration-300 shadow-sm",
          aiEnabled 
            ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10" 
            : "bg-gradient-to-r from-secondary/40 to-secondary/30 border-border/50"
        )}>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Auto-Pilot</span>
            <span className={cn("text-[10px] font-bold", aiEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60")}>
              {aiEnabled ? "ACTIVE" : "OFF"}
            </span>
          </div>
          
          <button 
            onClick={() => toggleAiMutation.mutate()}
            disabled={toggleAiMutation.isPending}
            className={cn(
              "relative w-11 h-6 rounded-full transition-all duration-300 flex items-center px-0.5 shadow-inner",
              aiEnabled 
                ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.4)]" 
                : "bg-gradient-to-r from-muted to-muted/80"
            )}
          >
            <div className={cn(
              "w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-lg flex items-center justify-center",
              aiEnabled ? "translate-x-5" : "translate-x-0"
            )}>
              {toggleAiMutation.isPending ? (
                <Zap className="w-3 h-3 text-emerald-500 animate-pulse" />
              ) : (
                <Power className={cn("w-3 h-3", aiEnabled ? "text-emerald-500" : "text-muted-foreground")} />
              )}
            </div>
          </button>
        </div>

        {/* NAVIGATION MATRIX */}
        <div className="flex items-center gap-1.5 border-l border-border/50 pl-4">
          {/* NEW: REGISTRY BUTTON */}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onOpenManageContacts}
            className="hidden sm:flex h-9 gap-2 text-xs font-semibold uppercase tracking-wider hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/5 hover:text-primary rounded-lg transition-all duration-200 hover:shadow-sm"
          >
            <Database className="w-4 h-4" />
            <span className="hidden xl:inline">Registry</span>
          </Button>

          <Button 
            variant="ghost" 
            size="sm"
            onClick={onOpenListManager}
            className="hidden sm:flex h-9 gap-2 text-xs font-semibold uppercase tracking-wider hover:bg-gradient-to-r hover:from-indigo-500/10 hover:to-indigo-500/5 hover:text-indigo-500 rounded-lg transition-all duration-200 hover:shadow-sm"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden xl:inline">Segments</span>
          </Button>

          <Button 
            variant="ghost" 
            size="sm"
            onClick={onOpenTemplates}
            className="hidden sm:flex h-9 gap-2 text-xs font-semibold uppercase tracking-wider hover:bg-gradient-to-r hover:from-emerald-500/10 hover:to-emerald-500/5 hover:text-emerald-500 rounded-lg transition-all duration-200 hover:shadow-sm"
          >
            <LayoutTemplate className="w-4 h-4" />
            <span className="hidden xl:inline">Templates</span>
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onOpenScheduler}
            className="hidden sm:flex h-9 gap-2 text-xs font-semibold uppercase tracking-wider hover:bg-gradient-to-r hover:from-amber-500/10 hover:to-amber-500/5 hover:text-amber-500 rounded-lg transition-all duration-200 hover:shadow-sm"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden xl:inline">Scheduler</span>
          </Button>
        </div>

        {/* UTILITY CLUSTER */}
        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg hover:bg-secondary/50 transition-all duration-200">
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-background shadow-sm" />
          </Button>
          
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-secondary/50 transition-all duration-200">
            <Settings className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border/50 mx-1" />
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLogout}
            className="h-9 w-9 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-200 active:scale-95"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}