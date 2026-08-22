import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Database,
  Layers,
  LayoutTemplate,
  Calendar,
  Settings,
  HelpCircle,
  MessageCircleQuestion,
  ChevronUp,
  MessageSquare,
  LogOut,
  Shield,
  Loader2,
  Mic,
  Bot,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export interface AppSidebarProps {
  onOpenRegistry: () => void;
  onOpenSegments: () => void;
  onOpenTemplates: () => void;
  onOpenScheduler: () => void;
  onOpenCallAnalysis?: () => void;
  onOpenConversations?: () => void;
  onOpenSessions?: () => void;
  onOpenOperators?: () => void;
  onLogout: () => void;
  onOpenHelp?: () => void;
  user?: { username: string };
  isAdmin?: boolean;
  isConnected?: boolean;
  userLoading?: boolean;
}

export function AppSidebar({
  onOpenRegistry,
  onOpenSegments,
  onOpenTemplates,
  onOpenScheduler,
  onOpenCallAnalysis,
  onOpenConversations,
  onOpenSessions,
  onOpenOperators,
  onLogout,
  onOpenHelp,
  user,
  isAdmin,
  isConnected,
  userLoading,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" side="left" className="border-r border-sidebar-border">
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 border-b border-sidebar-border/50 p-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <MessageSquare className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="truncate font-bold text-sidebar-foreground">Buildesk</span>
              <p className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                CRM
              </p>
            </div>
          )}
        </div>
        <SidebarTrigger className="shrink-0" />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/80">
            <ChevronUp className="h-3.5 w-3.5" />
            {!isCollapsed && "Navigate"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onOpenRegistry}
                  tooltip="Contacts"
                  className="cursor-pointer"
                >
                  <Database className="h-4 w-4 shrink-0" />
                  <span>Contacts</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onOpenSegments}
                  tooltip="Lists"
                  className="cursor-pointer"
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Lists</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onOpenTemplates}
                  tooltip="Templates"
                  className="cursor-pointer"
                >
                  <LayoutTemplate className="h-4 w-4 shrink-0" />
                  <span>Templates</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onOpenScheduler}
                  tooltip="Scheduler"
                  className="cursor-pointer"
                >
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Scheduler</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {onOpenSessions && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={onOpenSessions}
                    tooltip="WhatsApp Sessions"
                    className="cursor-pointer"
                  >
                    <Smartphone className="h-4 w-4 shrink-0" />
                    <span>Sessions</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {onOpenConversations && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={onOpenConversations}
                    tooltip="Conversations"
                    className="cursor-pointer"
                  >
                    <Bot className="h-4 w-4 shrink-0" />
                    <span>Conversations</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {onOpenCallAnalysis && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={onOpenCallAnalysis}
                    tooltip="Call Analysis"
                    className="cursor-pointer"
                  >
                    <Mic className="h-4 w-4 shrink-0" />
                    <span>Call Analysis</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/80">
            <ChevronUp className="h-3.5 w-3.5" />
            {!isCollapsed && "More"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Settings"
                  className="cursor-pointer"
                >
                  <button className="w-full">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span>Settings</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Night Mode">
                  <div className="flex w-full items-center gap-2">
                    <ThemeToggle />
                    <span className="group-data-[collapsible=icon]:hidden">Night Mode</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onOpenHelp}
                  tooltip="Help Center"
                  className="cursor-pointer"
                >
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  <span>Help Center</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Support"
                  className="cursor-pointer"
                >
                  <a href="#" className="w-full" onClick={(e) => e.preventDefault()}>
                    <MessageCircleQuestion className="h-4 w-4 shrink-0" />
                    <span>Support</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border/50 p-2">
        {/* WAHA status */}
        {!isCollapsed && (
          <div
            className={cn(
              "mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
              isConnected
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            )}
          >
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"
              )}
            />
            <span className="truncate">
              {isConnected ? "WhatsApp connected" : "Connecting…"}
            </span>
          </div>
        )}

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-auto w-full justify-start gap-3 rounded-lg p-2 hover:bg-sidebar-accent",
                isCollapsed && "justify-center p-2"
              )}
            >
              <Avatar className="h-9 w-9 shrink-0 rounded-full border-2 border-sidebar-border">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {userLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    (user?.username ?? "?")
                      .slice(0, 2)
                      .toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <span className="truncate text-sm font-semibold text-sidebar-foreground">
                    {userLoading ? "…" : user?.username ?? "User"}
                  </span>
                  <span className="truncate text-[10px] text-sidebar-foreground/70">
                    {user?.username ? `${user.username}@buildesk` : "—"}
                  </span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-56">
            {isAdmin && onOpenOperators && (
              <DropdownMenuItem onClick={onOpenOperators}>
                <Shield className="mr-2 h-4 w-4" />
                Team
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
