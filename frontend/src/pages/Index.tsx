import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  SidebarProvider,
  SidebarInset,
  SidebarRail,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ContactList } from "@/components/ContactList";
import { AdminUserModal } from "@/components/AdminUserModal";
import { ChatInterface } from "@/components/ChatInterface";
import { TemplateLabModal } from "@/components/TemplateLabModal";
import { SchedulerView } from "@/components/SchedulerView";
import { UserManagementModal } from "@/components/UserManagementModal";
import { ManageContactsModal } from "@/components/ManageContactsModal";
import { ListManagerModal } from "@/components/ListManagerModal";
import { HelpBot } from "@/components/HelpBot";
import { CallAnalysisView } from "@/components/CallAnalysisView";
import { ConversationView } from "@/components/ConversationView";
import { SessionsView } from "@/components/SessionsView";
import { BarChart3, MessageCircle, Power, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DashboardAnalytics } from "@/components/DashboardAnalytics";
import { toast } from "sonner";

const OPEN_HELPBOT_EVENT = "buildesk:open-helpbot";

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageBuffer, setMessageBuffer] = useState<string>("");
  const [viewMode, setViewMode] = useState<"chat" | "analytics">("chat");
  const [contactListCollapsed, setContactListCollapsed] = useState(false);

  const [isTemplateLabOpen, setIsTemplateLabOpen] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [isListManagerOpen, setIsListManagerOpen] = useState(false);
  const [isManageContactsOpen, setIsManageContactsOpen] = useState(false);
  const [isUserListOpen, setIsUserListOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCallAnalysisOpen, setIsCallAnalysisOpen] = useState(false);
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);

  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: api.auth.getMe,
  });

  const isAdmin = currentUser?.user?.username?.trim().toLowerCase() === "admin";
  const aiEnabled = currentUser?.user?.ai_enabled ?? false;

  const toggleAiMutation = useMutation({
    mutationFn: () => api.request("/admin/toggle-ai", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      if (data.ai_enabled) {
        toast.success("AI Sentry Protocol: GLOBAL AUTO-REPLY ENGAGED", {
          description: "Gemini AI is now managing incoming transmissions.",
          className: "bg-emerald/10 border-emerald/20 text-emerald font-black",
        });
      } else {
        toast.warning("AI Sentry Protocol: OFFLINE", {
          description: "Manual response mode restored.",
        });
      }
    },
    onError: () => {
      toast.error("System Override Failed: Check Matrix Connection");
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: api.dashboard.getStats,
    refetchInterval: 10000,
  });

  const { data: wahaStatus } = useQuery({
    queryKey: ["waha-status"],
    queryFn: api.dashboard.getStatus,
    refetchInterval: 5000,
  });

  const defaultSession = (wahaStatus as { defaultSession?: string } | undefined)?.defaultSession ?? "default";
  const sessionsList = (wahaStatus as { sessions?: { name: string; status?: string }[] } | undefined)?.sessions ?? [];
  const isConnected = (() => {
    const session = sessionsList.find((s: { name: string }) => s.name === defaultSession);
    const status = session?.status?.toUpperCase();
    return status === "CONNECTED" || status === "ONLINE";
  })();

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      navigate("/login");
    } catch {
      navigate("/login");
    }
  };

  const closeAllModals = () => {
    setIsTemplateLabOpen(false);
    setIsSchedulerOpen(false);
    setIsListManagerOpen(false);
    setIsManageContactsOpen(false);
    setIsUserListOpen(false);
    setIsCreateUserOpen(false);
    setIsCallAnalysisOpen(false);
    setIsSessionsOpen(false);
  };

  const openContacts = () => {
    closeAllModals();
    setIsManageContactsOpen(true);
  };
  const openLists = () => {
    closeAllModals();
    setIsListManagerOpen(true);
  };
  const openTemplates = () => {
    closeAllModals();
    setIsTemplateLabOpen(true);
  };
  const openScheduler = () => {
    closeAllModals();
    setIsSchedulerOpen(true);
  };
  const openCallAnalysis = () => {
    closeAllModals();
    setIsCallAnalysisOpen(true);
  };
  const openOperators = () => {
    closeAllModals();
    setIsUserListOpen(true);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden font-sans text-foreground transition-colors duration-500">
      <div
        className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-indigo-500/5 pointer-events-none opacity-40" />

      <SidebarProvider defaultOpen={false}>
        <AppSidebar
          onOpenRegistry={openContacts}
          onOpenSegments={openLists}
          onOpenTemplates={openTemplates}
          onOpenScheduler={openScheduler}
            onOpenCallAnalysis={openCallAnalysis}
          onOpenConversations={() => setIsConversationOpen(true)}
          onOpenSessions={isAdmin ? () => setIsSessionsOpen(true) : undefined}
          onOpenOperators={isAdmin ? openOperators : undefined}
          onLogout={handleLogout}
          onOpenHelp={() => window.dispatchEvent(new CustomEvent(OPEN_HELPBOT_EVENT))}
          user={currentUser?.user}
          isAdmin={isAdmin}
          isConnected={isConnected}
          userLoading={userLoading}
        />

        <SidebarInset>
          {/* Slim top bar: view toggle + Auto-Pilot + stats */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/50 bg-background/80 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("chat")}
                  className={cn(
                    "h-8 px-3 text-xs font-medium rounded-md transition-all",
                    viewMode === "chat"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("analytics")}
                  className={cn(
                    "h-8 px-3 text-xs font-medium rounded-md transition-all",
                    viewMode === "analytics"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                  Analytics
                </Button>
              </div>
              {/* Auto-Pilot toggle - always visible */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200",
                  aiEnabled
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-muted/50 border-border/50"
                )}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  Auto-Pilot
                </span>
                <button
                  type="button"
                  onClick={() => toggleAiMutation.mutate()}
                  disabled={toggleAiMutation.isPending}
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-all flex items-center px-0.5 shrink-0",
                    aiEnabled
                      ? "bg-emerald-500"
                      : "bg-muted"
                  )}
                  title={aiEnabled ? "Auto-Pilot ON" : "Auto-Pilot OFF"}
                >
                  <span
                    className={cn(
                      "block w-4 h-4 bg-white rounded-full transition-transform shadow",
                      aiEnabled ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
                {toggleAiMutation.isPending ? (
                  <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />
                ) : (
                  <span
                    className={cn(
                      "text-[10px] font-bold shrink-0",
                      aiEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    )}
                  >
                    {aiEnabled ? "ON" : "OFF"}
                  </span>
                )}
              </div>
            </div>
            {stats != null && (
              <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                <span>{stats.total_leads} contacts</span>
                <span>{stats.total_msgs} messages</span>
                {stats.pending_schedules > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {stats.pending_schedules} scheduled
                  </span>
                )}
              </div>
            )}
          </div>

          <main className="flex-1 flex overflow-hidden">
            {isSessionsOpen ? (
              <SessionsView
                isOpen={true}
                onClose={() => setIsSessionsOpen(false)}
                defaultSessionName={defaultSession}
              />
            ) : isCallAnalysisOpen ? (
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <CallAnalysisView
                  isOpen={true}
                  onClose={() => setIsCallAnalysisOpen(false)}
                  embedded
                />
              </div>
            ) : (
              <>
                {viewMode === "chat" && (
                  <div
                    className={cn(
                      "flex-shrink-0 border-r border-border/50 bg-background/50 overflow-hidden flex flex-col transition-[width] duration-200 ease-out",
                      contactListCollapsed ? "w-14" : "w-72 lg:w-80"
                    )}
                  >
                    <ContactList
                      selectedContact={selectedContact}
                      onSelectContact={(phone) => setSelectedContact(phone)}
                      collapsed={contactListCollapsed}
                      onCollapsedChange={setContactListCollapsed}
                    />
                  </div>
                )}

                <div
                  className={cn(
                    "flex-1 min-w-0 bg-background transition-colors duration-500 overflow-hidden flex flex-col",
                    viewMode === "analytics" && "overflow-y-auto"
                  )}
                >
                  {viewMode === "chat" ? (
                    <ChatInterface
                      activeContact={selectedContact}
                      onOpenTemplates={openTemplates}
                      onCloseChat={() => setSelectedContact(null)}
                      templateBody={messageBuffer}
                      onTemplateConsumed={() => setMessageBuffer("")}
                    />
                  ) : (
                    <div className="p-6 max-w-6xl mx-auto w-full">
                      <h1 className="text-xl font-bold text-foreground mb-1">Analytics</h1>
                      <p className="text-sm text-muted-foreground mb-6">
                        Performance and activity
                      </p>
                      <DashboardAnalytics />
                    </div>
                  )}
                </div>
              </>
            )}
          </main>

        </SidebarInset>

        <SidebarRail />
      </SidebarProvider>

      <HelpBot />

      <ManageContactsModal
        isOpen={isManageContactsOpen}
        onClose={() => setIsManageContactsOpen(false)}
      />

      <TemplateLabModal
        isOpen={isTemplateLabOpen}
        onClose={() => setIsTemplateLabOpen(false)}
        onSelectTemplate={(text) => setMessageBuffer(text)}
      />

      <SchedulerView
        isOpen={isSchedulerOpen}
        onClose={() => setIsSchedulerOpen(false)}
      />
      <ConversationView
        isOpen={isConversationOpen}
        onClose={() => setIsConversationOpen(false)}
      />


      <ListManagerModal
        isOpen={isListManagerOpen}
        onClose={() => setIsListManagerOpen(false)}
      />

      <UserManagementModal
        isOpen={isUserListOpen}
        onClose={() => setIsUserListOpen(false)}
        onOpenCreate={() => {
          setIsUserListOpen(false);
          setIsCreateUserOpen(true);
        }}
      />

      <AdminUserModal
        isOpen={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
      />

      <div className="fixed bottom-2 left-2 pointer-events-none opacity-40">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Buildesk v5.0
        </p>
      </div>
    </div>
  );
};

export default Index;
