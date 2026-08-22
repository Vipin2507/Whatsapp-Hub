import { useState, useMemo, useEffect } from "react";
import {
  Users, Search, Trash2, Loader2, X, Edit3,
  ChevronLeft, UserPlus, Filter, Database,
  Phone, Tag, UserCheck, Calendar, ShieldAlert,
  CheckSquare, Square, Save, Eraser, Activity, ArrowRight
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Contact } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { normalizeContactPhone } from "@/lib/phone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { BulkActionModal } from "./BulkActionModal";

interface ManageContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LEAD_STAGES = ["New", "Follow-up", "Hot", "Cold", "Closed"];

const getStageColor = (stage: string) => {
  switch (stage?.toLowerCase()) {
    case 'hot': return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    case 'closed': return "bg-emerald/20 text-emerald border-emerald/30";
    case 'follow-up': return "bg-warning/15 text-warning-foreground border-warning/30";
    case 'cold': return "bg-muted text-muted-foreground border-border";
    default: return "bg-primary/10 text-primary border-primary/20";
  }
};

export function ManageContactsModal({ isOpen, onClose }: ManageContactsModalProps) {
  const queryClient = useQueryClient();

  // UI States
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [assignedToFilter, setAssignedToFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkActionOpen, setIsBulkActionOpen] = useState(false);


  // Forge (Sidebar) States
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStage, setNewStage] = useState("New");
  const [newAgent, setNewAgent] = useState("");

  // --- 1. DATA QUERIES ---
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
  });

  // --- 2. TACTICAL HELPERS ---
  const resetForge = () => {
    setEditingId(null); setNewName("");
    setNewPhone(""); setNewStage("New"); setNewAgent("");
  };

  const handleEditInitiate = (c: Contact) => {
    setEditingId(c.id!);
    setNewName(c.name || "");
    // Ensure stage is set correctly - handle null/undefined cases
    const contactStage = c.stage && LEAD_STAGES.includes(c.stage) ? c.stage : "New";
    setNewStage(contactStage);
    setNewAgent(c.assigned_to || "");

    setNewPhone(c.phone || "");
    // Scroll to top of sidebar
    setTimeout(() => {
      document.getElementById('registry-forge')?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  // --- 3. MUTATIONS ---
  const upsertMutation = useMutation({
    mutationFn: (data: any) => editingId ? api.contacts.update(editingId, data) : api.contacts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(editingId ? "Contact updated" : "Contact added");
      resetForge();
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || error?.message || "Operation failed";
      toast.error(errorMessage);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.contacts.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact removed");
      setSelectedIds(prev => prev.filter(i => i !== deletedId));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to delete contact");
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      // Delete contacts one by one (backend doesn't have bulk delete endpoint)
      const results = await Promise.allSettled(
        ids.map(id => api.contacts.delete(id))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      return { succeeded, failed, total: ids.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (result.failed > 0) {
        toast.warning(`Deleted ${result.succeeded} of ${result.total} contacts. ${result.failed} failed.`);
      } else {
        toast.success(`Successfully deleted ${result.succeeded} contact${result.succeeded > 1 ? 's' : ''}`);
      }
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast.error("Bulk delete failed. Check system logs.");
    }
  });

  // --- 4. FILTERING & SELECTION ---
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

  const uniqueAssignedTo = useMemo(() => {
    const assigned = new Set<string>();
    contacts.forEach(c => {
      if (c.assigned_to && c.assigned_to !== "Unassigned") {
        assigned.add(c.assigned_to);
      }
    });
    return Array.from(assigned).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      // Search filter: if search is empty, match all; otherwise check name or phone
      const matchesSearch = !search ||
        (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
        (c.phone && c.phone.includes(search));

      // Stage filter: if "All" is selected, match all contacts; otherwise match by stage
      const matchesStage = stageFilter === "All" ||
        (c.stage && c.stage === stageFilter) ||
        (!c.stage && stageFilter === "New");

      // Assigned to filter
      const matchesAssigned = assignedToFilter === "All" ||
        (assignedToFilter === "Unassigned" && (!c.assigned_to || c.assigned_to === "Unassigned")) ||
        (c.assigned_to === assignedToFilter);

      // Date filter
      const matchesDate = contactMatchesDateFilter(c);

      return matchesSearch && matchesStage && matchesAssigned && matchesDate;
    });
  }, [contacts, search, stageFilter, assignedToFilter, dateFilter, rangeStart, rangeEnd]);

  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const handleSelectAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(c => c.id!).filter((id): id is number => Boolean(id)));

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 bottom-0 left-[var(--app-sidebar-width,16rem)] z-[120] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* HEADER COMMAND BAR */}
      <div className="h-24 border-b border-border/50 bg-gradient-to-r from-card/80 via-card/60 to-card/80 backdrop-blur-xl px-10 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          <Button variant="ghost" onClick={onClose} className="group flex items-center gap-3 text-muted-foreground hover:text-primary transition-all font-medium text-sm">
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Back
          </Button>
          <div className="w-px h-8 bg-border/50" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-105">
              <Users className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Contacts</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">{contacts.length} contacts</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-12 h-12 bg-gradient-to-r from-secondary/30 to-secondary/20 border-border/50 rounded-2xl font-semibold shadow-sm hover:shadow-md transition-all"
            />
          </div>
          <Button onClick={onClose} variant="secondary" className="h-12 w-12 rounded-xl hover:bg-secondary/80 transition-all"><X className="w-6 h-6" /></Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        <aside id="registry-forge" className="w-[30%] min-w-[380px] border-r border-border/50 bg-muted/20 p-8 overflow-y-auto space-y-6 custom-scrollbar relative">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                {editingId ? <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {editingId ? "Edit contact" : "Add contact"}
              </h3>
              {(newName || newPhone || editingId) && (
                <Button variant="ghost" onClick={resetForge} className="h-6 text-[8px] font-semibold uppercase hover:text-destructive transition-all rounded-lg">
                  <Eraser className="w-3 h-3 mr-1" /> Clear
                </Button>
              )}
            </div>

            <div className="p-8 bg-gradient-to-br from-card/80 to-card/60 border border-border/50 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 space-y-5">
              {editingId && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                  <p className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Editing Contact ID: {editingId}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="h-12 rounded-xl bg-gradient-to-r from-background to-secondary/20 border-border/50 font-bold text-xs shadow-sm focus:shadow-md transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Phone</label>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="+2347033302755 or 9876543210 (India)"
                  className="h-12 rounded-xl bg-gradient-to-r from-background to-secondary/20 border-border/50 font-bold text-xs shadow-sm focus:shadow-md transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Status</label>
                  <Select value={newStage} onValueChange={setNewStage}>
                    <SelectTrigger className="h-12 rounded-xl font-black uppercase text-[10px] bg-gradient-to-r from-background to-secondary/20 border-border/50 shadow-sm focus:shadow-md transition-all">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent className="z-[200] bg-popover border-border shadow-xl" side="bottom" align="start">
                      {LEAD_STAGES.map(s => (
                        <SelectItem
                          key={s}
                          value={s}
                          className="text-[10px] font-bold uppercase cursor-pointer hover:bg-accent focus:bg-accent"
                        >
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Assigned to</label>
                  <Input
                    value={newAgent}
                    onChange={e => setNewAgent(e.target.value)}
                    placeholder="Agent or team"
                    className="h-12 rounded-xl bg-gradient-to-r from-background to-secondary/20 border-border/50 font-bold text-xs shadow-sm focus:shadow-md transition-all"
                  />
                </div>
              </div>

              <Button
                onClick={() => {
                  const phone = normalizeContactPhone(newPhone);
                  if (!newName?.trim()) return toast.error("Name is required");
                  if (!phone) return toast.error("Enter a valid phone number");
                  upsertMutation.mutate({ name: newName.trim(), phone, stage: newStage, assigned_to: newAgent || "Unassigned" });
                }}
                disabled={!newName || !newPhone || upsertMutation.isPending}
                className={cn(
                  "w-full h-14 rounded-2xl font-semibold uppercase text-[10px] tracking-wider transition-all duration-200 active:scale-95",
                  editingId
                    ? "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
                    : "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
                )}
              >
                {upsertMutation.isPending ? <Loader2 className="animate-spin" /> : editingId ? <><Save className="w-4 h-4 mr-2" /> Save changes</> : "Save contact"}
              </Button>
            </div>
          </div>

          <div className="p-4 bg-muted/30 border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-medium">Note</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use full international numbers with +country code, or a 10-digit India mobile (91 is added automatically).
            </p>
          </div>
        </aside>

        {/* MAIN DIRECTORY: LIST VIEW */}
        <main className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-background">
          {/* FILTERS BAR */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-40 h-9 rounded-lg bg-secondary/30 border-border text-[10px] font-semibold">
                  <Tag className="w-3.5 h-3.5 mr-2 text-primary" />
                  <SelectValue placeholder="Stage">
                    {stageFilter === "All" ? "All Stages" : stageFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="All">All Stages</SelectItem>
                  {LEAD_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                <SelectTrigger className="w-44 h-9 rounded-lg bg-secondary/30 border-border text-[10px] font-semibold">
                  <UserCheck className="w-3.5 h-3.5 mr-2 text-primary" />
                  <SelectValue placeholder="Assigned to">
                    {assignedToFilter === "All" ? "All Agents" : assignedToFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="All">All Agents</SelectItem>
                  <SelectItem value="Unassigned">Unassigned</SelectItem>
                  {uniqueAssignedTo.map(agent => <SelectItem key={agent} value={agent}>{agent}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-40 h-9 rounded-lg bg-secondary/30 border-border text-[10px] font-semibold">
                  <Calendar className="w-3.5 h-3.5 mr-2 text-primary" />
                  <SelectValue placeholder="Date">
                    {dateFilter === "all" ? "All Time" : dateFilter === "today" ? "Today" : dateFilter === "7days" ? "Last 7 Days" : dateFilter === "30days" ? "Last 30 Days" : "Range"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="range">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {dateFilter === "range" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="h-9 w-36 text-[10px] rounded-lg bg-secondary/30 border-border"
                    placeholder="Start date"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="h-9 w-36 text-[10px] rounded-lg bg-secondary/30 border-border"
                    placeholder="End date"
                  />
                </div>
              )}

              {(search || stageFilter !== "All" || assignedToFilter !== "All" || dateFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStageFilter("All");
                    setAssignedToFilter("All");
                    setDateFilter("all");
                    setRangeStart("");
                    setRangeEnd("");
                  }}
                  className="h-9 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Clear filters
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{contacts.length}</span> contacts
              </p>

              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (selectedIds.length > 0) {
                        requestAnimationFrame(() => {
                          setIsBulkActionOpen(true);
                        });
                      }
                    }}
                    disabled={selectedIds.length === 0}
                    className="h-9 px-4 rounded-lg text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                    Edit {selectedIds.length}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`Delete ${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''}?`)) {
                        bulkDeleteMutation.mutate(selectedIds);
                      }
                    }}
                    disabled={bulkDeleteMutation.isPending}
                    className="h-9 px-4 rounded-lg text-[10px] font-semibold transition-all"
                  >
                    {bulkDeleteMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Delete {selectedIds.length}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* LIST HEADERS */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center">
            <div className="col-span-1 flex justify-center">
              <button onClick={handleSelectAll} className="hover:opacity-70 transition-opacity">
                {selectedIds.length === filtered.length && filtered.length > 0 ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
              </button>
            </div>
            <div className="col-span-3 font-semibold">Name</div>
            <div className="col-span-2 text-center font-semibold">Phone</div>
            <div className="col-span-2 text-center font-semibold">Stage</div>
            <div className="col-span-2 text-center font-semibold">Assigned To</div>
            <div className="col-span-1 text-center font-semibold">Date</div>
            <div className="col-span-1 text-right font-semibold">Actions</div>
          </div>

          <div className="space-y-1 pb-20">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center opacity-30">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">Loading contacts...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center opacity-50">
                <Database className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="font-semibold uppercase text-[10px] tracking-wider text-muted-foreground">No contacts found</p>
                <p className="text-[9px] text-muted-foreground/70 mt-2">Try adjusting your search or filters</p>
              </div>
            ) : filtered.map((c) => {
              const activityDate = c.last_message_at || c.date;
              const dateDisplay = activityDate ? new Date(activityDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
              return (
                <div
                  key={c.id}
                  className={cn(
                    "grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30",
                    selectedIds.includes(c.id!)
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : "",
                    editingId === c.id && "bg-amber-500/10 border-l-2 border-l-amber-500"
                  )}
                >
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => toggleSelect(c.id!)} className="hover:opacity-70 transition-opacity">
                      {selectedIds.includes(c.id!) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>
                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-semibold text-[10px] text-primary shrink-0">
                      {c.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                  </div>
                  <div className="col-span-2 text-center font-mono text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={c.phone}>{c.phone}</div>
                  <div className="col-span-2 flex justify-center">
                    <Badge variant="outline" className={cn("text-[9px] font-semibold px-2 py-0.5 rounded-md", getStageColor(c.stage!))}>
                      {c.stage || "New"}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-xs font-medium text-foreground">{c.assigned_to || "Unassigned"}</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="text-[10px] text-muted-foreground">{dateDisplay}</span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditInitiate(c);
                      }}
                      className="h-8 w-8 rounded-md hover:bg-primary/10 hover:text-primary text-muted-foreground transition-all shrink-0"
                      title="Edit contact"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete ${c.name}?`)) {
                          deleteMutation.mutate(c.id!);
                        }
                      }}
                      className="h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      title="Delete contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <BulkActionModal
        isOpen={isBulkActionOpen}
        onClose={() => setIsBulkActionOpen(false)}
        selectedIds={selectedIds}
        selectedLeads={contacts.filter(c => selectedIds.includes(c.id!))}
        onSuccess={() => {
          setSelectedIds([]);
          queryClient.invalidateQueries({ queryKey: ["contacts"] });
        }}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: hsl(var(--border)); 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}