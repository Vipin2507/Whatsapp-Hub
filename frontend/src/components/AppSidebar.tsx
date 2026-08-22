import { LayoutGroup, motion } from "framer-motion";
import {
  Building2,
  Calendar,
  ClipboardList,
  LayoutTemplate,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Mic,
  PanelLeft,
  Rocket,
  Settings,
  Shield,
  Smartphone,
  Bot,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NAV_SPRING } from "@/lib/motion";
import { StatusPill } from "@/components/PendingChip";

export type NavKey =
  | "inbox"
  | "analytics"
  | "contacts"
  | "lists"
  | "templates"
  | "scheduler"
  | "sessions"
  | "conversations"
  | "calls"
  | "settings"
  | "help";

export interface AppSidebarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  onLogout: () => void;
  onOpenOperators?: () => void;
  user?: { username: string };
  isAdmin?: boolean;
  isConnected?: boolean;
  userLoading?: boolean;
}

const PRIMARY: { key: NavKey; label: string; icon: typeof Building2 }[] = [
  { key: "inbox", label: "Inbox", icon: MessageSquare },
  { key: "analytics", label: "Analytics", icon: Rocket },
  { key: "contacts", label: "Contacts", icon: Building2 },
  { key: "lists", label: "Lists", icon: ClipboardList },
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "scheduler", label: "Scheduler", icon: Calendar },
];

export function AppSidebar({
  active,
  onNavigate,
  onLogout,
  onOpenOperators,
  user,
  isAdmin,
  isConnected,
  userLoading,
}: AppSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  const secondary: { key: NavKey; label: string; icon: typeof Building2; show?: boolean }[] = [
    { key: "sessions", label: "Sessions", icon: Smartphone, show: isAdmin },
    { key: "conversations", label: "Conversations", icon: Bot, show: true },
    { key: "calls", label: "Call analysis", icon: Mic, show: true },
    { key: "settings", label: "Settings", icon: Settings, show: true },
    { key: "help", label: "Help", icon: LifeBuoy, show: true },
  ];

  return (
    <Sidebar collapsible="icon" side="left" className="border-r border-sidebar-border">
      <SidebarHeader
        className={cn(
          "h-14",
          collapsed
            ? "flex items-center justify-center p-0"
            : "flex flex-row items-center gap-2 border-b border-sidebar-border px-2.5",
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground">
                Buildesk
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
                Operations
              </span>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Collapse sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <LayoutGroup id="sidebar-nav">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {PRIMARY.map((item) => (
                  <NavButton
                    key={item.key}
                    item={item}
                    active={active === item.key}
                    collapsed={collapsed}
                    onClick={() => onNavigate(item.key)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {secondary
                  .filter((item) => item.show !== false)
                  .map((item) => (
                    <NavButton
                      key={item.key}
                      item={item}
                      active={active === item.key}
                      collapsed={collapsed}
                      onClick={() => onNavigate(item.key)}
                    />
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </LayoutGroup>
      </SidebarContent>

      <SidebarFooter className={cn("border-t border-sidebar-border", collapsed ? "items-center p-1.5" : "p-2")}>
        {!collapsed && (
          <div className="mb-1.5">
            <StatusPill
              label={isConnected ? "Live" : "Connecting"}
              tone={isConnected ? "success" : "warning"}
            />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-md hover:bg-sidebar-accent",
                collapsed ? "h-9 w-9 justify-center p-0" : "px-1.5 py-1.5",
              )}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-sidebar-primary/20 text-[10px] font-semibold text-sidebar-foreground">
                  {userLoading ? "…" : (user?.username ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-sidebar-foreground">
                  {userLoading ? "…" : user?.username ?? "User"}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-48">
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

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: { key: string; label: string; icon: typeof Building2 };
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <button
        type="button"
        onClick={onClick}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex cursor-pointer items-center rounded-md text-[13px] font-medium",
          collapsed ? "mx-auto h-9 w-9 justify-center" : "w-full gap-2 px-2.5 py-1.5",
          active ? "text-white" : "text-sidebar-foreground/75 hover:text-sidebar-foreground",
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-md bg-sidebar-accent"
            transition={NAV_SPRING}
          />
        )}
        {active && !collapsed && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
        )}
        <Icon className="relative z-10 h-4 w-4 shrink-0" />
        {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
      </button>
    </SidebarMenuItem>
  );
}
