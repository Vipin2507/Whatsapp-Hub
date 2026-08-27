import { useState, useRef, useEffect } from "react";
import {
  Search,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  UserPlus,
  Tag,
  Clock,
  Upload,
  Edit3,
  Trash2,
  XCircle,
  Filter,
  MoreVertical,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { api, Contact } from "@/lib/api";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { BulkImportModal } from "./BulkImportModal";
import { BulkActionModal } from "./BulkActionModal";
import { DateField } from "@/components/DateFields";
import { PhoneField } from "@/components/PhoneField";
import { composeDialedNumber, splitPhoneNumber } from "@/lib/countries";
import { EASE, hoverLift, tapScale } from "@/lib/motion";
import { StatusPill } from "@/components/PendingChip";
import { SelectCheck } from "@/components/SelectCheck";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppPreferences } from "@/hooks/use-app-settings";

interface ContactListProps {
  selectedContact: string | null;
  onSelectContact: (phone: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

const LEAD_STAGES = ["New", "Follow-up", "Hot", "Cold", "Closed"];

function stageTone(stage?: string) {
  switch (stage?.toLowerCase()) {
    case "hot":
      return "warning" as const;
    case "closed":
      return "success" as const;
    case "follow-up":
      return "info" as const;
    case "cold":
      return "muted" as const;
    default:
      return "info" as const;
  }
}

function formatListTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startToday - startThat) / 86400000);
  if (diff === 0) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function unreadLabel(count?: number) {
  const n = count || 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

export function ContactList({
  selectedContact,
  onSelectContact,
  collapsed: collapsedProp,
  onCollapsedChange,
  searchQuery: searchQueryProp,
  onSearchChange,
}: ContactListProps) {
  const queryClient = useQueryClient();
  const isCompact = useIsMobile();
  const prefs = useAppPreferences();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = !isCompact && (collapsedProp !== undefined ? collapsedProp : internalCollapsed);
  const handleToggleCollapsed = () => {
    const next = !isCollapsed;
    onCollapsedChange?.(next);
    if (onCollapsedChange == null) setInternalCollapsed(next);
  };

  const [localSearch, setLocalSearch] = useState("");
  const searchQuery = searchQueryProp ?? localSearch;
  const setSearchQuery = onSearchChange ?? setLocalSearch;
  const [filterStage, setFilterStage] = useState<string>("All");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectMode, setSelectMode] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkActionOpen, setIsBulkActionOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editPhoneInput, setEditPhoneInput] = useState("");
  const [editCountryCode, setEditCountryCode] = useState("91");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("91");
  const [newStage, setNewStage] = useState("New");
  const [newAssignedTo, setNewAssignedTo] = useState("");

  const contactMatchesDateFilter = (contact: Contact) => {
    if (dateFilter === "all") return true;
    const activityStamp = contact.last_message_at || contact.date;
    if (!activityStamp) return false;
    const contactTime = new Date(activityStamp).getTime();
    if (Number.isNaN(contactTime)) return false;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    if (dateFilter === "today") return contactTime >= startOfToday && contactTime <= endOfToday;
    if (dateFilter === "7days" || dateFilter === "30days") {
      const days = dateFilter === "7days" ? 7 : 30;
      const start = startOfToday - (days - 1) * 24 * 60 * 60 * 1000;
      return contactTime >= start && contactTime <= endOfToday;
    }
    if (dateFilter === "range") {
      const start = rangeStart ? new Date(rangeStart + "T00:00:00").getTime() : null;
      const end = rangeEnd ? new Date(rangeEnd + "T23:59:59.999").getTime() : null;
      if (start != null && Number.isNaN(start)) return false;
      if (end != null && Number.isNaN(end)) return false;
      if (start != null && end != null) return contactTime >= start && contactTime <= end;
      if (start != null) return contactTime >= start;
      if (end != null) return contactTime <= end;
      return true;
    }
    return true;
  };

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    refetchInterval: 4000,
  });

  const openChat = (phone: string) => {
    queryClient.setQueryData<Contact[]>(["contacts"], (old) =>
      old?.map((c) => (c.phone === phone ? { ...c, unread_count: 0 } : c)),
    );
    onSelectContact(phone);
  };

  const prevTopPhoneRef = useRef<string | null>(null);
  const [highlightPhone, setHighlightPhone] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredContacts = (contacts || []).filter((c) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      (c.name?.toLowerCase() || "").includes(searchLower) || (c.phone || "").includes(searchLower);
    const matchesStage = filterStage === "All" || c.stage === filterStage;
    return matchesSearch && matchesStage && contactMatchesDateFilter(c);
  });

  useEffect(() => {
    if (filteredContacts.length === 0) return;
    const newTopPhone = filteredContacts[0].phone;
    const prevTop = prevTopPhoneRef.current;
    const isNewTop = prevTop !== null && newTopPhone !== prevTop;
    const notViewingThisChat = selectedContact !== newTopPhone;
    if (isNewTop && notViewingThisChat) {
      setHighlightPhone(newTopPhone);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightPhone(null);
        highlightTimeoutRef.current = null;
      }, 2500);
    }
    prevTopPhoneRef.current = newTopPhone;
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [contacts, searchQuery, filterStage, selectedContact]);

  const addContactMutation = useMutation({
    mutationFn: (data: Partial<Contact>) => api.contacts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact saved");
      resetForm();
      setIsAddModalOpen(false);
    },
  });

  const handleStartEdit = (contact: Contact) => {
    setEditingContact(contact);
    const split = splitPhoneNumber(contact.phone || "", prefs.default_country_code);
    setEditCountryCode(split.dial);
    setEditPhoneInput(split.national);
  };

  const updateContactMutation = useMutation({
    mutationFn: async () => {
      if (!editingContact?.id) throw new Error("No contact");
      const phone = composeDialedNumber(editCountryCode, editPhoneInput);
      if (!phone) throw new Error("Invalid phone");
      return api.contacts.update(editingContact.id, {
        name: editingContact.name,
        phone,
        stage: editingContact.stage,
        assigned_to: editingContact.assigned_to,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact updated");
      setEditingContact(null);
      setEditPhoneInput("");
      setEditCountryCode(prefs.default_country_code);
    },
    onError: (err: Error) => {
      toast.error(err?.message === "Invalid phone" ? "Enter a valid phone number" : "Failed to update contact");
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => api.contacts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact removed");
    },
  });

  const resetForm = () => {
    setNewName("");
    setNewPhone("");
    setNewCountryCode(prefs.default_country_code);
    setNewStage("New");
    setNewAssignedTo("");
  };

  const handleAddContact = () => {
    if (!newName || !newPhone) return toast.error("Name and phone are required");
    const phone = composeDialedNumber(newCountryCode, newPhone);
    if (!phone) return toast.error("Enter a valid phone number");
    addContactMutation.mutate({
      name: newName,
      phone,
      stage: newStage,
      assigned_to: newAssignedTo || "Unassigned",
    });
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) setSelectedIds([]);
    else setSelectedIds(filteredContacts.map((c) => c.id!).filter(Boolean));
  };

  return (
    <aside className="relative z-10 flex h-full min-w-0 w-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold tracking-tight">Chats</h2>
              <span className="tabular-nums text-[10px] text-muted-foreground">{filteredContacts.length}</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleCollapsed}
          className="ml-auto hidden h-8 w-8 shrink-0 text-muted-foreground lg:inline-flex"
          title={isCollapsed ? "Show chats" : "Hide chats"}
        >
          {isCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="shrink-0 space-y-1.5 border-b px-2 py-2 sm:px-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 rounded-lg bg-muted/40 pl-8 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="h-9 min-w-0 flex-1 text-[11px]">
                <Tag className="mr-1 h-3 w-3 shrink-0" />
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All stages</SelectItem>
                {LEAD_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="h-9 min-w-0 flex-1 text-[11px]">
                <Clock className="mr-1 h-3 w-3 shrink-0" />
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="range">Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateFilter === "range" && (
            <div className="grid grid-cols-2 gap-1.5">
              <DateField value={rangeStart} onChange={setRangeStart} placeholder="From" size="sm" allowClear />
              <DateField value={rangeEnd} onChange={setRangeEnd} placeholder="To" size="sm" allowClear min={rangeStart} />
            </div>
          )}
        </div>
      )}

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
        {!isCollapsed && filteredContacts.length > 0 && (
          <div className="flex items-center px-3 py-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectMode((v) => !v);
                if (selectMode) setSelectedIds([]);
              }}
              className="text-[10px] font-medium text-muted-foreground hover:text-primary"
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
            {selectMode && (
              <div className="ml-2 inline-flex items-center gap-1.5">
                <SelectCheck
                  checked={selectedIds.length === filteredContacts.length && filteredContacts.length > 0}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < filteredContacts.length}
                  onClick={handleSelectAll}
                  label="Select all"
                />
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[10px] font-medium text-muted-foreground hover:text-primary"
                >
                  All
                </button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <p className="text-[11px] text-muted-foreground">Loading chats</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
            <Filter className="mb-1 h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No conversations</p>
          </div>
        ) : (
          <div className={cn(isCollapsed ? "flex flex-col items-center gap-1 px-1 py-2" : "pb-2")}>
            {filteredContacts.map((contact, i) => {
              const active = selectedContact === contact.phone;
              const highlighted = highlightPhone === contact.phone;
              const stamp = contact.last_message_at || contact.date;
              const preview = contact.last_message_preview?.trim() || contact.phone;
              const unread = active ? 0 : contact.unread_count || 0;
              const unreadText = unreadLabel(unread);

              if (isCollapsed) {
                return (
                  <button
                    key={contact.phone}
                    type="button"
                    title={contact.name || contact.phone}
                    onClick={() => openChat(contact.phone)}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-full",
                      active ? "ring-2 ring-primary/50" : "hover:bg-muted/50",
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
                        {(contact.name || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {unreadText ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-0.5 text-[8px] font-semibold text-success-foreground">
                        {unreadText}
                      </span>
                    ) : null}
                  </button>
                );
              }

              return (
                <motion.div
                  key={contact.phone}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, ease: EASE, delay: Math.min(i * 0.02, 0.16) }}
                  className="flex items-stretch"
                >
                  {selectMode && (
                    <div className="flex w-11 shrink-0 items-center justify-center">
                      <SelectCheck
                        checked={selectedIds.includes(contact.id!)}
                        onClick={(e) => toggleSelect(contact.id!, e)}
                        label={`Select ${contact.name || contact.phone}`}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openChat(contact.phone)}
                    className={cn(
                      "group relative flex min-h-[3.5rem] min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left",
                      active && "bg-primary/10",
                      highlighted && "bg-primary/12",
                      !active && unread > 0 && "bg-success/5",
                      !active && "hover:bg-muted/40",
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />}
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                        {(contact.name || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "min-w-0 truncate text-[13px]",
                            unread > 0 ? "font-semibold text-foreground" : "font-medium",
                            active && "text-primary",
                          )}
                        >
                          {contact.name || "Unknown"}
                        </span>
                        <span
                          className={cn(
                            "ml-auto shrink-0 text-[10px] tabular-nums",
                            unread > 0 ? "font-semibold text-success" : "text-muted-foreground",
                          )}
                        >
                          {formatListTime(stamp)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate text-[11px]",
                            unread > 0 ? "font-medium text-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {preview}
                        </p>
                        {contact.stage && unread === 0 ? (
                          <StatusPill
                            label={contact.stage}
                            tone={stageTone(contact.stage)}
                            className="max-w-[4.75rem] shrink-0 truncate px-1.5 py-0 text-[9px]"
                          />
                        ) : null}
                        {unreadText ? (
                          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-semibold text-success-foreground">
                            {unreadText}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-muted-foreground"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Contact actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => handleStartEdit(contact)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                        onClick={() => {
                          if (window.confirm(`Delete ${contact.name}?`)) deleteContactMutation.mutate(contact.id!);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedIds.length > 0 && !isCollapsed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="pointer-events-none absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex justify-center pr-14 sm:pr-0"
          >
            <motion.button
              type="button"
              whileHover={hoverLift}
              whileTap={tapScale}
              onClick={() => setIsBulkActionOpen(true)}
              className="pointer-events-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground shadow-soft"
            >
              Manage {selectedIds.length}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "shrink-0 border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pr-14 lg:pr-2",
          isCollapsed ? "flex flex-col gap-1.5" : "grid grid-cols-2 gap-1.5",
        )}
      >
        <Dialog open={isAddModalOpen} onOpenChange={(open) => {
          setIsAddModalOpen(open);
          if (open) setNewCountryCode(prefs.default_country_code);
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className={cn("h-9 w-full text-xs", isCollapsed && "px-0")}>
              <UserPlus className="h-3.5 w-3.5" />
              {!isCollapsed && "New"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <UserPlus className="h-3.5 w-3.5" />
                </span>
                New contact
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone</label>
                <PhoneField
                  countryCode={newCountryCode}
                  nationalNumber={newPhone}
                  onCountryCodeChange={setNewCountryCode}
                  onNationalNumberChange={setNewPhone}
                />
                <p className="text-[11px] text-muted-foreground">Select the country, then enter the local number.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stage</label>
                  <Select value={newStage} onValueChange={setNewStage}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned</label>
                  <Input placeholder="Agent" value={newAssignedTo} onChange={(e) => setNewAssignedTo(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddContact} disabled={addContactMutation.isPending} className="h-9 w-full">
                {addContactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsBulkModalOpen(true)}
          className={cn("h-9 w-full text-xs", isCollapsed && "px-0")}
        >
          <Upload className="h-3.5 w-3.5" />
          {!isCollapsed && "Import"}
        </Button>
      </div>

      <BulkImportModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />
      <BulkActionModal
        isOpen={isBulkActionOpen}
        onClose={() => setIsBulkActionOpen(false)}
        selectedIds={selectedIds}
        selectedLeads={contacts.filter((c) => selectedIds.includes(c.id!))}
        onSuccess={() => {
          setSelectedIds([]);
          setSelectMode(false);
        }}
      />

      <Dialog
        open={!!editingContact}
        onOpenChange={(open) => {
          if (!open) {
            setEditingContact(null);
            setEditPhoneInput("");
            setEditCountryCode(prefs.default_country_code);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Edit3 className="h-3.5 w-3.5" />
              </span>
              Edit contact
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                value={editingContact?.name || ""}
                onChange={(e) => setEditingContact((prev) => (prev ? { ...prev, name: e.target.value } : null))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone</label>
              <PhoneField
                countryCode={editCountryCode}
                nationalNumber={editPhoneInput}
                onCountryCodeChange={setEditCountryCode}
                onNationalNumberChange={setEditPhoneInput}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stage</label>
                <Select
                  value={editingContact?.stage}
                  onValueChange={(val) => setEditingContact((prev) => (prev ? { ...prev, stage: val } : null))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned</label>
                <Input
                  value={editingContact?.assigned_to || ""}
                  onChange={(e) => setEditingContact((prev) => (prev ? { ...prev, assigned_to: e.target.value } : null))}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => updateContactMutation.mutate()} disabled={updateContactMutation.isPending} className="h-9 w-full">
              {updateContactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
