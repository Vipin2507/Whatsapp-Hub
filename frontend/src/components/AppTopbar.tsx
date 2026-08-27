import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Menu, Search, LogOut, Shield, Settings, MessageCircle, Clock, CheckCheck, Layers, LayoutTemplate, X } from "lucide-react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSidebar } from "@/components/ui/sidebar";
import { useAppPreferences } from "@/hooks/use-app-settings";
import { api, type Contact, type Schedule, type LeadList, type Template } from "@/lib/api";
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
  onOpenLists?: (listId?: number) => void;
  onOpenTemplates?: () => void;
  selectedContact?: string | null;
  trailing?: ReactNode;
}

type SearchHit =
  | { kind: "contact"; id: string; contact: Contact }
  | { kind: "list"; id: string; list: LeadList }
  | { kind: "template"; id: string; template: Template }
  | { kind: "schedule"; id: string; schedule: Schedule };

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
  onOpenLists,
  onOpenTemplates,
  selectedContact,
  trailing,
}: AppTopbarProps) {
  const { toggleSidebar } = useSidebar();
  const prefs = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeHit, setActiveHit] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const primedRef = useRef(false);
  const prevUnreadRef = useRef<Record<string, number>>({});

  const query = (search || "").trim();
  const searching = searchOpen || query.length > 0;

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    refetchInterval: 4000,
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: api.lists.getAll,
    enabled: searching,
    staleTime: 20_000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.getAll,
    enabled: searching,
    staleTime: 20_000,
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules"],
    queryFn: api.schedule.getAll,
    refetchInterval: prefs.notify_pending_schedules ? 15000 : false,
    enabled: prefs.notify_pending_schedules || searching,
  });

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.toLowerCase();
    if (!q) return [];
    const contactHits: SearchHit[] = contacts
      .filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))
      .slice(0, 6)
      .map((contact) => ({ kind: "contact", id: `c-${contact.phone}`, contact }));
    const listHits: SearchHit[] = lists
      .filter(
        (l) =>
          (l.title || "").toLowerCase().includes(q) || (l.description || "").toLowerCase().includes(q),
      )
      .slice(0, 4)
      .map((list) => ({ kind: "list", id: `l-${list.id}`, list }));
    const templateHits: SearchHit[] = templates
      .filter(
        (t) =>
          (t.title || "").toLowerCase().includes(q) || (t.body || "").toLowerCase().includes(q),
      )
      .slice(0, 4)
      .map((template) => ({ kind: "template", id: `t-${template.id}`, template }));
    const scheduleHits: SearchHit[] = schedules
      .filter(
        (s) =>
          (s.phone || "").includes(q) ||
          (s.content || "").toLowerCase().includes(q) ||
          (s.list_title || "").toLowerCase().includes(q),
      )
      .slice(0, 3)
      .map((schedule) => ({ kind: "schedule", id: `s-${schedule.id}`, schedule }));
    return [...contactHits, ...listHits, ...templateHits, ...scheduleHits];
  }, [query, contacts, lists, templates, schedules]);

  useEffect(() => {
    setActiveHit(0);
  }, [query]);

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

  const clearSearch = () => {
    onSearchChange?.("");
    setSearchOpen(false);
    setActiveHit(0);
  };

  const pickHit = (hit: SearchHit) => {
    if (hit.kind === "contact") onOpenChat?.(hit.contact.phone);
    if (hit.kind === "list") onOpenLists?.(hit.list.id);
    if (hit.kind === "template") onOpenTemplates?.();
    if (hit.kind === "schedule") onOpenScheduler?.();
    clearSearch();
  };

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

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

      <div ref={searchBoxRef} className="relative min-w-0 flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search ?? ""}
          onChange={(e) => {
            onSearchChange?.(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              clearSearch();
              (e.target as HTMLInputElement).blur();
              return;
            }
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveHit((i) => (i + 1) % hits.length);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveHit((i) => (i - 1 + hits.length) % hits.length);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              pickHit(hits[activeHit] ?? hits[0]);
            }
          }}
          placeholder="Search contacts, lists, templates…"
          className="h-9 rounded-lg border bg-card pl-9 pr-8 text-sm"
          aria-label="Search"
        />
        {query ? (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}

        {searchOpen && query ? (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border bg-card shadow-elevated">
            {hits.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches for “{query}”</p>
            ) : (
              <ul className="max-h-[min(22rem,70vh)] overflow-y-auto py-1">
                {hits.map((hit, index) => {
                  const active = index === activeHit;
                  return (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveHit(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickHit(hit)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                          active ? "bg-primary/10" : "hover:bg-muted/50",
                        )}
                      >
                        {hit.kind === "contact" ? (
                          <>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                              {(hit.contact.name || "?").slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{hit.contact.name || hit.contact.phone}</span>
                              <span className="block truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                                {hit.contact.phone}
                              </span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">Chat</span>
                          </>
                        ) : null}
                        {hit.kind === "list" ? (
                          <>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                              <Layers className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{hit.list.title}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {hit.list.count} contact{hit.list.count !== 1 ? "s" : ""}
                              </span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">List</span>
                          </>
                        ) : null}
                        {hit.kind === "template" ? (
                          <>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                              <LayoutTemplate className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{hit.template.title}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{hit.template.body}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">Template</span>
                          </>
                        ) : null}
                        {hit.kind === "schedule" ? (
                          <>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
                              <Clock className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">
                                {hit.schedule.list_title || hit.schedule.phone}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">{hit.schedule.content}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">Schedule</span>
                          </>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
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
