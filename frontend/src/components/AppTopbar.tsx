import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Menu, Search, LogOut, Shield, Settings, MessageCircle, Clock, CheckCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSidebar } from "@/components/ui/sidebar";
import { useAppPreferences } from "@/hooks/use-app-settings";
import { api, type Contact, type Schedule } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppTopbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  user?: { username: string };
  isAdmin?: boolean;
  onLogout: () => void;
  onOpenOperators?: () => void;
  onOpenSettings?: () => void;
  onOpenChat?: (phone: string) => void;
  onOpenScheduler?: () => void;
  selectedContact?: string | null;
  trailing?: ReactNode;
}

function formatNoticeTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "Now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clip(text?: string | null, max = 52) {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (!value) return "New message";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function requestDesktopPermission() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission();
}

export function AppTopbar({
  search,
  onSearchChange,
  user,
  isAdmin,
  onLogout,
  onOpenOperators,
  onOpenSettings,
  onOpenChat,
  onOpenScheduler,
  selectedContact,
  trailing,
}: AppTopbarProps) {
  const { toggleSidebar } = useSidebar();
  const prefs = useAppPreferences();
  const [open, setOpen] = useState(false);
  const primedRef = useRef(false);
  const prevUnreadRef = useRef<Record<string, number>>({});

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    refetchInterval: 4000,
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules"],
    queryFn: api.schedule.getAll,
    refetchInterval: 15000,
    enabled: prefs.notify_pending_schedules,
  });

  const unreadChats = useMemo(
    () =>
      contacts
        .filter((c) => (c.unread_count || 0) > 0)
        .sort((a, b) => {
          const aTime = new Date(a.last_message_at || a.date || 0).getTime();
          const bTime = new Date(b.last_message_at || b.date || 0).getTime();
          return bTime - aTime;
        }),
    [contacts],
  );

  const pendingSchedules = useMemo(
    () =>
      prefs.notify_pending_schedules
        ? schedules
            .filter((s) => (s.status || "").toUpperCase() === "PENDING")
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
        : [],
    [schedules, prefs.notify_pending_schedules],
  );

  const unreadMessages = unreadChats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const badgeCount = unreadMessages + pendingSchedules.length;
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);

  useEffect(() => {
    if (prefs.notify_new_messages) requestDesktopPermission();
  }, [prefs.notify_new_messages]);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const contact of contacts) {
      next[contact.phone] = contact.unread_count || 0;
    }
    if (!primedRef.current) {
      prevUnreadRef.current = next;
      primedRef.current = true;
      return;
    }
    if (!prefs.notify_new_messages) {
      prevUnreadRef.current = next;
      return;
    }
    for (const contact of contacts) {
      const prev = prevUnreadRef.current[contact.phone] || 0;
      const curr = contact.unread_count || 0;
      if (curr <= prev || contact.phone === selectedContact) continue;
      const preview = clip(contact.last_message_preview);
      toast(contact.name || contact.phone, {
        description: preview,
        icon: <MessageCircle className="h-4 w-4 text-primary" />,
        duration: 4000,
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        try {
          new Notification(contact.name || contact.phone, {
            body: preview,
            tag: `chat-${contact.phone}`,
          });
        } catch {
          /* ignore unsupported Notification options */
        }
      }
    }
    prevUnreadRef.current = next;
  }, [contacts, prefs.notify_new_messages, selectedContact]);

  const openChat = (contact: Contact) => {
    setOpen(false);
    onOpenChat?.(contact.phone);
  };

  const openScheduler = () => {
    setOpen(false);
    onOpenScheduler?.();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-2 backdrop-blur sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleSidebar}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <div className="relative hidden min-w-0 flex-1 max-w-md sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Search contacts, lists, tickets…"
          className="h-9 rounded-lg border bg-card pl-9 text-sm"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {trailing}
        <ThemeToggle />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {badgeCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                  {badgeLabel}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[22rem] p-0">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-[11px] text-muted-foreground">
                  {badgeCount > 0 ? `${badgeCount} waiting` : "You're up to date"}
                </p>
              </div>
              {onOpenSettings ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                >
                  Settings
                </button>
              ) : null}
            </div>
            <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
              {unreadChats.length === 0 && pendingSchedules.length === 0 ? (
                <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                  <CheckCheck className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No new messages or pending sends.</p>
                </div>
              ) : (
                <>
                  {unreadChats.length > 0 ? (
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Unread chats
                    </div>
                  ) : null}
                  {unreadChats.slice(0, 8).map((contact) => (
                    <button
                      key={contact.phone}
                      type="button"
                      onClick={() => openChat(contact)}
                      className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {(contact.name || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-semibold">{contact.name || contact.phone}</span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {formatNoticeTime(contact.last_message_at || contact.date)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                            {clip(contact.last_message_preview)}
                          </span>
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-semibold text-success-foreground">
                            {(contact.unread_count || 0) > 99 ? "99+" : contact.unread_count}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                  {pendingSchedules.length > 0 ? (
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pending sends
                    </div>
                  ) : null}
                  {pendingSchedules.slice(0, 5).map((item: Schedule) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={openScheduler}
                      className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-medium">{item.list_title || item.phone}</span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {formatNoticeTime(item.time)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{clip(item.content)}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-0.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-primary/10"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {(user?.username ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onOpenSettings ? (
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            ) : null}
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
      </div>
    </header>
  );
}
