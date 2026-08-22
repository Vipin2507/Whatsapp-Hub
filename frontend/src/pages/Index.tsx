import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { SidebarProvider, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar, type NavKey } from "@/components/AppSidebar";
import { AppTopbar } from "@/components/AppTopbar";
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
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardAnalytics } from "@/components/DashboardAnalytics";
import { PageHeader, PageWrap } from "@/components/PageWrap";
import { tabSwap } from "@/lib/motion";
import { toast } from "sonner";

const OPEN_HELPBOT_EVENT = "buildesk:open-helpbot";

type SessionUser = { username: string; ai_enabled?: boolean };

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageBuffer, setMessageBuffer] = useState<string>("");
  const [activeNav, setActiveNav] = useState<NavKey>("inbox");
  const [contactListCollapsed, setContactListCollapsed] = useState(false);
  const [search, setSearch] = useState("");

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
    queryFn: () => api.auth.getMe() as Promise<{ user?: SessionUser }>,
  });

  const isAdmin = currentUser?.user?.username?.trim().toLowerCase() === "admin";
  const aiEnabled = currentUser?.user?.ai_enabled ?? false;

  const toggleAiMutation = useMutation({
    mutationFn: () => api.request("/admin/toggle-ai", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      if (data.ai_enabled) {
        toast.success("Auto-reply enabled");
      } else {
        toast.message("Auto-reply off");
      }
    },
    onError: () => {
      toast.error("Could not update auto-reply");
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.dashboard.getStats(),
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
    setIsConversationOpen(false);
  };

  const handleNavigate = (key: NavKey) => {
    closeAllModals();
    setActiveNav(key);
    if (key === "contacts") setIsManageContactsOpen(true);
    if (key === "lists") setIsListManagerOpen(true);
    if (key === "templates") setIsTemplateLabOpen(true);
    if (key === "scheduler") setIsSchedulerOpen(true);
    if (key === "sessions" && isAdmin) setIsSessionsOpen(true);
    if (key === "conversations") setIsConversationOpen(true);
    if (key === "calls") setIsCallAnalysisOpen(true);
    if (key === "help") window.dispatchEvent(new CustomEvent(OPEN_HELPBOT_EVENT));
  };

  const closeOverlay = (fallback: NavKey = "inbox") => {
    closeAllModals();
    setActiveNav(fallback);
  };

  const showInbox = activeNav === "inbox" || ["contacts", "lists", "templates", "scheduler", "help", "settings"].includes(activeNav);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-foreground">
      <SidebarProvider defaultOpen={false}>
        <AppSidebar
          active={activeNav}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onOpenOperators={isAdmin ? () => setIsUserListOpen(true) : undefined}
          user={currentUser?.user}
          isAdmin={isAdmin}
          isConnected={isConnected}
          userLoading={userLoading}
        />

        <SidebarInset className="min-h-0 overflow-hidden">
          <AppTopbar
            search={search}
            onSearchChange={setSearch}
            notificationCount={stats?.pending_schedules ?? 0}
            user={currentUser?.user}
            isAdmin={isAdmin}
            onLogout={handleLogout}
            onOpenOperators={isAdmin ? () => setIsUserListOpen(true) : undefined}
            trailing={
              <button
                type="button"
                onClick={() => toggleAiMutation.mutate()}
                disabled={toggleAiMutation.isPending}
                className={cn(
                  "hidden h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[10px] font-medium sm:inline-flex",
                  aiEnabled
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <Zap className="h-3.5 w-3.5" />
                Auto-reply {aiEnabled ? "on" : "off"}
              </button>
            }
          />

          <div className="flex min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
            {isSessionsOpen ? (
              <SessionsView
                isOpen={true}
                onClose={() => closeOverlay()}
                defaultSessionName={defaultSession}
              />
            ) : isCallAnalysisOpen ? (
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <CallAnalysisView
                  isOpen={true}
                  onClose={() => closeOverlay()}
                  embedded
                />
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {activeNav === "analytics" ? (
                  <motion.div
                    key="analytics"
                    className="min-h-0 flex-1 overflow-y-auto"
                    initial={tabSwap.initial}
                    animate={tabSwap.animate}
                    exit={tabSwap.exit}
                    transition={tabSwap.transition}
                  >
                    <PageWrap>
                      <PageHeader
                        title="Analytics"
                        subtitle="Workload, mix, and delivery health"
                      />
                      <DashboardAnalytics
                        onOpenContacts={() => handleNavigate("contacts")}
                        onOpenScheduler={() => handleNavigate("scheduler")}
                        onOpenLists={() => handleNavigate("lists")}
                      />
                    </PageWrap>
                  </motion.div>
                ) : showInbox ? (
                  <motion.div
                    key="inbox"
                    className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
                    initial={tabSwap.initial}
                    animate={tabSwap.animate}
                    exit={tabSwap.exit}
                    transition={tabSwap.transition}
                  >
                    <div
                      className={cn(
                        "flex shrink-0 flex-col overflow-hidden border-r bg-background transition-[width] duration-300 ease-expo",
                        contactListCollapsed ? "w-14" : "w-72 lg:w-80",
                      )}
                    >
                      <ContactList
                        selectedContact={selectedContact}
                        onSelectContact={(phone) => setSelectedContact(phone)}
                        collapsed={contactListCollapsed}
                        onCollapsedChange={setContactListCollapsed}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
                      <ChatInterface
                        activeContact={selectedContact}
                        onOpenTemplates={() => handleNavigate("templates")}
                        onCloseChat={() => setSelectedContact(null)}
                        templateBody={messageBuffer}
                        onTemplateConsumed={() => setMessageBuffer("")}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            )}
          </div>
        </SidebarInset>

        <SidebarRail />
      </SidebarProvider>

      <HelpBot />

      <ManageContactsModal
        isOpen={isManageContactsOpen}
        onClose={() => closeOverlay()}
      />
      <TemplateLabModal
        isOpen={isTemplateLabOpen}
        onClose={() => closeOverlay()}
        onSelectTemplate={(text) => setMessageBuffer(text)}
      />
      <SchedulerView isOpen={isSchedulerOpen} onClose={() => closeOverlay()} />
      <ConversationView isOpen={isConversationOpen} onClose={() => closeOverlay()} />
      <ListManagerModal isOpen={isListManagerOpen} onClose={() => closeOverlay()} />
      <UserManagementModal
        isOpen={isUserListOpen}
        onClose={() => setIsUserListOpen(false)}
        onOpenCreate={() => {
          setIsUserListOpen(false);
          setIsCreateUserOpen(true);
        }}
      />
      <AdminUserModal isOpen={isCreateUserOpen} onClose={() => setIsCreateUserOpen(false)} />
    </div>
  );
};

export default Index;
