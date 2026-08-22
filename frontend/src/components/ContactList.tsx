import { useState, useRef, useEffect } from "react";
import {
  Search, ChevronLeft, ChevronRight, Loader2, UserPlus,
  Phone, User, Tag, Filter, XCircle, Clock, Upload,
  CheckSquare, Square, CheckCircle2, Edit3, Trash2, MessageCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Contact } from "@/lib/api";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
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
import { toast } from "sonner";
import { BulkImportModal } from "./BulkImportModal";
import { BulkActionModal } from "./BulkActionModal";
import { normalizeContactPhone } from "@/lib/phone";

interface ContactListProps {
  selectedContact: string | null;
  onSelectContact: (phone: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const LEAD_STAGES = ["New", "Follow-up", "Hot", "Cold", "Closed"];

const getStageColor = (stage: string) => {
  switch (stage?.toLowerCase()) {
    case 'hot': return "bg-orange-500/20 text-orange-500 border-orange-500/30 dark:text-orange-400";
    case 'closed': return "bg-emerald/20 text-emerald border-emerald/30";
    case 'follow-up': return "bg-warning/15 text-warning-foreground border-warning/30";
    case 'cold': return "bg-muted text-muted-foreground border-border";
    default: return "bg-primary/10 text-primary border-primary/20";
  }
};

export function ContactList({ selectedContact, onSelectContact, collapsed: collapsedProp, onCollapsedChange }: ContactListProps) {
  const queryClient = useQueryClient();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;
  const handleToggleCollapsed = () => {
    const next = !isCollapsed;
    onCollapsedChange?.(next);
    if (onCollapsedChange == null) setInternalCollapsed(next);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<string>("All");

  const [dateFilter, setDateFilter] = useState<string>("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkActionOpen, setIsBulkActionOpen] = useState(false);

  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // --- PHONE (single field, international or 10-digit India) ---
  const [editPhoneInput, setEditPhoneInput] = useState("");

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStage, setNewStage] = useState("New");
  const [newAssignedTo, setNewAssignedTo] = useState("");

  // --- LOGIC HELPERS ---
  const contactMatchesDateFilter = (contact: Contact) => {
    if (dateFilter === "all") return true;
    const activityStamp = contact.last_message_at || contact.date;
    if (!activityStamp) return false;

    const contactTime = new Date(activityStamp).getTime();
    if (Number.isNaN(contactTime)) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

    if (dateFilter === "today") {
      return contactTime >= startOfToday && contactTime <= endOfToday;
    }

    if (dateFilter === "7days" || dateFilter === "30days") {
      const days = dateFilter === "7days" ? 7 : 30;
      const start = startOfToday - (days - 1) * 24 * 60 * 60 * 1000; // include today
      return contactTime >= start && contactTime <= endOfToday;
    }

    if (dateFilter === "range") {
      // rangeStart/rangeEnd are YYYY-MM-DD
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

  // --- QUERIES ---
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    refetchInterval: 5000,
  });

  // --- NEW MESSAGE: detect top contact change, show WhatsApp-style notification + smooth highlight ---
  const prevTopPhoneRef = useRef<string | null>(null);
  const [highlightPhone, setHighlightPhone] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredContactsForOrder = (contacts || []).filter(c => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (c.name?.toLowerCase() || "").includes(searchLower) || (c.phone || "").includes(searchLower);
    const matchesStage = filterStage === "All" || c.stage === filterStage;
    const matchesDate = contactMatchesDateFilter(c);
    return matchesSearch && matchesStage && matchesDate;
  });

  useEffect(() => {
    if (filteredContactsForOrder.length === 0) return;
    const newTopPhone = filteredContactsForOrder[0].phone;
    const prevTop = prevTopPhoneRef.current;
    const isNewTop = prevTop !== null && newTopPhone !== prevTop;
    const notViewingThisChat = selectedContact !== newTopPhone;
    if (isNewTop && notViewingThisChat) {
      const contact = filteredContactsForOrder[0];
      const name = contact.name || "Unknown";
      const preview = contact.last_message_preview?.trim() || "New message";
      toast.success(name, {
        description: preview.length > 40 ? preview.slice(0, 40) + "…" : preview,
        icon: <MessageCircle className="w-4 h-4 text-primary" />,
        duration: 4000,
        className: "border-primary/20 bg-card shadow-lg",
      });
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

  // --- MUTATIONS ---
  const addContactMutation = useMutation({
    mutationFn: (data: any) => api.contacts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact saved");
      resetForm();
      setIsAddModalOpen(false);
    },
  });

  const handleStartEdit = (contact: Contact) => {
    setEditingContact(contact);
    setEditPhoneInput(contact.phone || "");
  };

  const updateContactMutation = useMutation({
    mutationFn: async () => {
      if (!editingContact?.id) throw new Error("No contact");
      const phone = normalizeContactPhone(editPhoneInput);
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
    setNewName(""); setNewPhone(""); setNewStage("New"); setNewAssignedTo("");
  };

  const handleAddContact = () => {
    if (!newName || !newPhone) return toast.error("Name and Phone are mandatory");
    const phone = normalizeContactPhone(newPhone);
    if (!phone) return toast.error("Enter a valid phone number");
    addContactMutation.mutate({
      name: newName,
      phone,
      stage: newStage,
      assigned_to: newAssignedTo || "Unassigned"
    });
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContacts.map(c => c.id!).filter(id => id !== undefined));
    }
  };

  const filteredContacts = (contacts || []).filter(c => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (c.name?.toLowerCase() || "").includes(searchLower) || (c.phone || "").includes(searchLower);
    const matchesStage = filterStage === "All" || c.stage === filterStage;
    const matchesDate = contactMatchesDateFilter(c);
    return matchesSearch && matchesStage && matchesDate;
  });

  return (
    <aside className="h-full w-full flex flex-col bg-background text-foreground relative z-10 min-w-0">
      {/* 1. MESSAGING HEADER + NEW CHAT BAR (WhatsApp-style) */}
      <div className="shrink-0 border-b border-border/50 bg-card/50">
        <div className="px-3 py-2 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground text-sm">Messaging</h2>
              <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] font-semibold rounded-full">
                {filteredContacts.length}
              </Badge>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={handleToggleCollapsed} className="shrink-0 h-8 w-8 rounded-lg" title={isCollapsed ? "Show contacts" : "Hide contacts"}>
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
        {!isCollapsed && (
          <div className="px-3 pb-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search or start new chat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs rounded-lg bg-muted/50 border-border/50"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <XCircle className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="h-8 text-[10px] rounded-lg flex-1">
                  <Tag className="w-3 h-3 mr-1.5" />
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="All">All Stages</SelectItem>
                  {LEAD_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 text-[10px] rounded-lg w-[100px]">
                  <Clock className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="range">Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateFilter === "range" && (
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="h-8 text-[10px] rounded-lg bg-muted/50 border-border/50"
                />
                <Input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="h-8 text-[10px] rounded-lg bg-muted/50 border-border/50"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. FLOATING SELECTION FAB */}
      {selectedIds.length > 0 && !isCollapsed && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in zoom-in slide-in-from-bottom-4">
          <Button
            onClick={() => setIsBulkActionOpen(true)}
            className="h-10 px-6 bg-primary text-white rounded-full shadow-2xl flex items-center gap-3 border border-white/20 hover:scale-105 active:scale-95 transition-all font-black uppercase text-[9px] tracking-widest"
          >
            <CheckCircle2 className="w-4 h-4" />
            Manage {selectedIds.length} Selected
          </Button>
        </div>
      )}

      {/* 4. CONTACTS LIST - compact rows */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-1.5 space-y-1">
        {!isCollapsed && filteredContacts.length > 0 && (
          <div className="flex items-center gap-2 px-1.5 py-1">
            <button type="button" onClick={handleSelectAll} className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors">
              {selectedIds.length === filteredContacts.length ? <CheckSquare className="w-3 h-3 text-primary" /> : <Square className="w-3 h-3" />}
              Select ({filteredContacts.length})
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 opacity-30"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12 opacity-60"><Filter className="w-6 h-6 mx-auto mb-1.5" /><p className="text-[10px] font-medium">No contacts</p></div>
        ) : (
          <div className="space-y-1">
            {filteredContacts.map((contact) => (
              <div
                key={contact.phone}
                className={cn(
                  "flex items-center gap-1.5 group relative transition-all duration-300 ease-out",
                  isCollapsed && "justify-center",
                  highlightPhone === contact.phone && "animate-in fade-in duration-300"
                )}
              >
                {!isCollapsed && (
                  <button
                    type="button"
                    onClick={(e) => toggleSelect(contact.id!, e)}
                    className={cn(
                      "shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all",
                      selectedIds.includes(contact.id!) ? "bg-primary border-primary text-white" : "bg-transparent border-border group-hover:border-primary/50 text-transparent"
                    )}
                  >
                    <CheckSquare className="w-2.5 h-2.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectContact(contact.phone)}
                  className={cn(
                    "flex items-center gap-2.5 min-w-0 border text-left relative transition-all duration-300 ease-out rounded-xl",
                    isCollapsed
                      ? "w-10 h-10 min-w-10 min-h-10 max-w-10 max-h-10 shrink-0 self-center rounded-full p-0 justify-center items-center overflow-hidden"
                      : "flex-1 p-2",
                    selectedContact === contact.phone
                      ? "bg-primary/10 border-primary/30 shadow-sm"
                      : "bg-card/30 border-transparent hover:bg-muted/50 hover:border-border/50",
                    highlightPhone === contact.phone && "ring-2 ring-primary/40 bg-primary/15 border-primary/20 shadow-sm"
                  )}
                >
                  {!isCollapsed && (
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all z-20">
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); setEditingContact(contact); }}>
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${contact.name}?`)) deleteContactMutation.mutate(contact.id!); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <Avatar className={cn("shrink-0 border border-border", isCollapsed ? "w-8 h-8" : "w-9 h-9")}>
                    <AvatarFallback className={cn("font-semibold", isCollapsed ? "text-[8px]" : "text-[9px]")}>{contact.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn("text-xs font-semibold truncate", selectedContact === contact.phone ? "text-primary" : "text-foreground")}>
                          {contact.name || "Unknown"}
                        </span>
                        <Badge variant="outline" className={cn("text-[9px] font-medium px-1 py-0 border shrink-0", getStageColor(contact.stage!))}>{contact.stage}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {contact.assigned_to || "Unassigned"} ·{" "}
                        {contact.last_message_at || contact.date
                          ? new Date((contact.last_message_at || contact.date) as string).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                          : "—"}
                      </p>
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. FOOTER ACTIONS */}
      <div className="shrink-0 p-2 border-t border-border/50 bg-card/30">
        <div className={cn("grid gap-1.5", isCollapsed ? "grid-cols-1" : "grid-cols-2")}>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button
                className={cn(
                  "w-full h-9 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5",
                  isCollapsed && "px-0"
                )}
              >
                <UserPlus className="w-3.5 h-3.5" />
                {!isCollapsed && <span>New</span>}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background border-border rounded-[2rem] w-[95vw] max-w-lg sm:max-w-md px-6 py-5">
              <DialogHeader className="pb-4 border-b border-border/50">
                <DialogTitle className="text-xl font-semibold flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl">
                    <UserPlus className="w-5 h-5 text-primary" />
                  </div>
                  <span>Add contact</span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-5 pt-5 pb-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Name</label>
                  <Input placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} className="h-12 bg-secondary/50 rounded-2xl" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Phone</label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+2347033302755 or 9876543210 (India)"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="h-12 bg-secondary/50 rounded-2xl font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Status</label>
                    <Select value={newStage} onValueChange={setNewStage}>
                      <SelectTrigger className="h-12 bg-secondary/50 rounded-2xl text-[10px] font-black uppercase">
                        <SelectValue placeholder="Stage" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                        {LEAD_STAGES.map(s => (
                          <SelectItem
                            key={s}
                            value={s}
                            className="text-[10px] font-black uppercase"
                          >
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Assigned to</label>
                    <Input placeholder="Agent or team" value={newAssignedTo} onChange={e => setNewAssignedTo(e.target.value)} className="h-12 bg-secondary/50 rounded-2xl" />
                  </div>
                </div>
              </div>
              <DialogFooter className="pt-4 border-t border-border/50">
                <Button
                  onClick={handleAddContact}
                  className="w-full h-11 bg-primary text-primary-foreground font-semibold rounded-xl"
                >
                  {addContactMutation.isPending ? <Loader2 className="animate-spin" /> : "Save contact"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button onClick={() => setIsBulkModalOpen(true)} variant="outline" className={cn("w-full h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5", isCollapsed && "px-0")}>
            <Upload className="w-3.5 h-3.5" />
            {!isCollapsed && <span>Bulk</span>}
          </Button>
        </div>
      </div>

      <BulkImportModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />
      <BulkActionModal
        isOpen={isBulkActionOpen}
        onClose={() => setIsBulkActionOpen(false)}
        selectedIds={selectedIds}
        selectedLeads={contacts.filter(c => selectedIds.includes(c.id))}
        onSuccess={() => setSelectedIds([])}
      />

      {/* EDIT LEAD METADATA MODAL */}
      <Dialog open={!!editingContact} onOpenChange={(open) => {
        if (!open) {
          setEditingContact(null);
          setEditPhoneInput("");
        }
      }}>
        <DialogContent className="bg-background border-border text-foreground rounded-[2.5rem] max-w-md shadow-2xl">
          <DialogHeader className="pb-4 border-b border-border/50">
            <DialogTitle className="text-xl font-semibold flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl"><Edit3 className="w-5 h-5 text-primary" /></div> Edit contact
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={editingContact?.name || ""}
                onChange={e => setEditingContact(prev => prev ? { ...prev, name: e.target.value } : null)}
                className="h-12 bg-secondary/50 rounded-2xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Phone</label>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={editPhoneInput}
                onChange={e => setEditPhoneInput(e.target.value)}
                placeholder="+country and number, or 10-digit India"
                className="h-12 bg-secondary/50 rounded-2xl font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">CRM Status</label>
                <Select
                  value={editingContact?.stage}
                  onValueChange={val => setEditingContact(prev => prev ? { ...prev, stage: val } : null)}
                >
                  <SelectTrigger className="h-12 bg-secondary/50 rounded-2xl text-[10px] font-black uppercase"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {LEAD_STAGES.map(s => <SelectItem key={s} value={s} className="text-[10px] font-black uppercase">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Assigned to</label>
                <Input
                  value={editingContact?.assigned_to || ""}
                  onChange={e => setEditingContact(prev => prev ? { ...prev, assigned_to: e.target.value } : null)}
                  className="h-12 bg-secondary/50 rounded-2xl"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t border-border/50">
            <Button
              onClick={() => updateContactMutation.mutate()}
              disabled={updateContactMutation.isPending}
              className="w-full h-14 bg-primary text-white font-black uppercase rounded-2xl shadow-xl transition-all active:scale-95"
            >
              {updateContactMutation.isPending ? <Loader2 className="animate-spin" /> : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}