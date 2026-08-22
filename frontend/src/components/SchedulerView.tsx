import { useState } from "react";
import {
  X, Search, Calendar, Clock, Library, Plus, Loader2,
  Trash2, Tag, HeartHandshake, RefreshCw, ChevronLeft, ChevronRight,
  Zap, Layers, User, Users, MessageSquare, Save, Eraser,
  AlertCircle, Send, ArrowRight, CheckCircle2, Play,
  Info, XCircle, Timer,
  Copy, Eye, EyeOff, Edit3
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Schedule, Template, RecurrenceType, RecurrenceConfig } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SchedulerViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SchedulerView({ isOpen, onClose }: SchedulerViewProps) {
  const queryClient = useQueryClient();

  // UI & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedSchedule, setExpandedSchedule] = useState<number | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedSchedules, setSelectedSchedules] = useState<Set<number>>(new Set());
  /** Analysis view: All | Single (one-off) | Bulk (batches by same message+time) */
  const [analysisView, setAnalysisView] = useState<"all" | "single" | "bulk">("all");
  /** Create Schedule panel: when false, minimized to save space */
  const [createPanelExpanded, setCreatePanelExpanded] = useState(true);
  /** Expanded bulk batch key for detail (content|time or list_id|content|time) */
  const [expandedBatchKey, setExpandedBatchKey] = useState<string | null>(null);
  /** Filters: search by name/phone/message (searchQuery), by list name, by date */
  const [searchByListName, setSearchByListName] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Dispatch Forge State
  const [targetType, setTargetType] = useState<"single" | "list">("single");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [countryCode, setCountryCode] = useState("91");
  const [useExistingContact, setUseExistingContact] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [contactSearch, setContactSearch] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [messageEditorOpen, setMessageEditorOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageDraftPreview, setMessageDraftPreview] = useState(false);
  // Recurrence: once | daily | every_n_days | weekly | hourly
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("once");
  const [intervalDays, setIntervalDays] = useState(2);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [recurrenceTimeOnly, setRecurrenceTimeOnly] = useState("09:00"); // HH:MM for daily/weekly
  const [hourlyMinute, setHourlyMinute] = useState(0);

  // --- 1. DATA QUERIES ---
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: api.schedule.getAll,
    enabled: isOpen,
    refetchInterval: 5000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.getAll,
    enabled: isOpen,
  });

  const { data: lists = [], isLoading: listsLoading, error: listsError } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: api.lists.getAll,
    enabled: isOpen,
    refetchInterval: 10000, // Refresh every 10 seconds to ensure lists are up to date
    staleTime: 0, // Always consider data stale to ensure fresh fetch
    refetchOnMount: true, // Always refetch when component mounts
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
    refetchInterval: 15000,
  });

  // --- 2. MUTATIONS ---
  const createMutation = useMutation({
    mutationFn: () => {
      const timeToUse = recurrenceType === "once" ? newTime : getFirstRunTime();
      const recConfig = getRecurrenceConfig();
      const payload = {
        time: timeToUse,
        message: newMessage,
        ...(recurrenceType !== "once" && { recurrence_type: recurrenceType, recurrence_config: recConfig }),
      };
      if (targetType === "list") {
        if (!selectedListId) throw new Error("Please select a list");
        return api.schedule.createBatch({ listId: selectedListId, ...payload });
      } else {
        let finalPhone = "";
        if (useExistingContact && selectedContactId) {
          const contact = contacts.find((c: any) => String(c.id) === selectedContactId);
          if (!contact) throw new Error("Selected contact not found");
          finalPhone = contact.phone;
        } else {
          if (!newPhone) throw new Error("Phone number is required");
          finalPhone = combinePhone(countryCode, newPhone);
        }
        if (!finalPhone) throw new Error("Recipient phone number is required");
        return api.schedule.create({ phone: finalPhone, ...payload });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      resetForge();
      toast.success("Message scheduled");
    },
    onError: (err: any) => toast.error(err.message || "Failed to schedule")
  });

  // TACTICAL: Manual Retry for stuck/failed messages
  const retryMutation = useMutation({
    // Ensure the id is forced to a Number to avoid the "3:1" string issue
    mutationFn: (id: number) => api.request(`/schedule/retry/${Number(id)}`, {
      method: 'POST'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Message sent now");
    },
    onError: (err: any) => toast.error(`Force failed: ${err.message}`)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { phone?: string; message?: string; time?: string } }) =>
      api.schedule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setEditingSchedule(null);
      resetForge();
      toast.success("Schedule updated successfully");
    },
    onError: (err: any) => toast.error(err.message || "Update failed")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.schedule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Scheduled message removed");
    },
    onError: () => toast.error("Could not remove. Try again.")
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(
        ids.map(id => api.schedule.delete(id))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      return { success: ids.length - failed, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setSelectedSchedules(new Set());
      if (result.failed === 0) {
        toast.success(`${result.success} schedules deleted successfully`);
      } else {
        toast.warning(`${result.success} deleted, ${result.failed} failed`);
      }
    },
    onError: () => toast.error("Bulk delete failed")
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(
        ids.map(id => api.request(`/schedule/retry/${Number(id)}`, { method: 'POST' }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      return { success: ids.length - failed, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setSelectedSchedules(new Set());
      if (result.failed === 0) {
        toast.success(`${result.success} messages sent successfully`);
      } else {
        toast.warning(`${result.success} sent, ${result.failed} failed`);
      }
    },
    onError: () => toast.error("Bulk send failed")
  });

  // --- 3. TACTICAL HELPERS ---
  const combinePhone = (cc: string, ph: string) => {
    const cleanCC = cc.replace(/\D/g, "");
    const cleanPH = ph.replace(/\D/g, "");
    return `${cleanCC}${cleanPH}`;
  };

  const resetForge = () => {
    setNewPhone("");
    setNewTime("");
    setNewMessage("");
    setSelectedListId("");
    setCountryCode("91");
    setUseExistingContact(false);
    setSelectedContactId("");
    setEditingSchedule(null);
    setRecurrenceType("once");
    setRecurrenceTimeOnly("09:00");
    setIntervalDays(2);
    setDaysOfWeek([]);
    setHourlyMinute(0);
  };

  // Compute first run datetime for recurrence types that use time-only or hourly
  const getFirstRunTime = (): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (recurrenceType === "once") return newTime;
    if (recurrenceType === "daily") {
      const [h, m] = recurrenceTimeOnly.split(":").map(Number);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      const run = now <= today ? today : new Date(today.getTime() + 24 * 60 * 60 * 1000);
      return `${run.getFullYear()}-${pad(run.getMonth() + 1)}-${pad(run.getDate())}T${pad(run.getHours())}:${pad(run.getMinutes())}`;
    }
    if (recurrenceType === "weekly" && daysOfWeek.length > 0) {
      const [h, m] = recurrenceTimeOnly.split(":").map(Number);
      // daysOfWeek: 0=Sun, 1=Mon, ..., 6=Sat. JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
      let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      for (let i = 0; i <= 8; i++) {
        if (daysOfWeek.includes(d.getDay())) {
          if (d > now) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        d.setDate(d.getDate() + 1);
      }
      return newTime;
    }
    if (recurrenceType === "hourly") {
      const next = new Date(now);
      next.setHours(next.getHours() + 1);
      next.setMinutes(hourlyMinute, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
    }
    return newTime;
  };

  const getRecurrenceConfig = (): RecurrenceConfig | undefined => {
    if (recurrenceType === "every_n_days") return { interval_days: Math.max(1, intervalDays) };
    if (recurrenceType === "weekly" && daysOfWeek.length > 0) return { days_of_week: [...daysOfWeek].sort((a, b) => a - b) };
    if (recurrenceType === "hourly") return { interval_hours: 1 };
    return undefined;
  };

  const toggleDayOfWeek = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const handleLoadTemplate = (t: Template) => {
    setNewMessage(t.body);
    setShowLibrary(false);
    setMessageDraft(t.body);
    toast.success(`Payload Loaded: ${t.title}`);
  };

  // Schedule date part (YYYY-MM-DD) for date filter
  const scheduleDatePart = (m: Schedule) => (m.time || "").trim().split(" ")[0] || "";

  const filteredSchedules = schedules.filter(m => {
    const contact = contacts.find((c: any) => c.phone === m.phone);
    const contactName = contact?.name || "";
    const matchesSearch = !searchQuery.trim() || m.phone.includes(searchQuery) ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contactName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesListName = !searchByListName.trim() ||
      (m.list_title || "").toLowerCase().includes(searchByListName.toLowerCase());
    const matchesDate = !filterDate.trim() || scheduleDatePart(m) === filterDate;
    const matchesStatus = statusFilter === "All" || m.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesListName && matchesDate && matchesStatus;
  });

  // Group: when list_id is set, group by list (so bulk view shows list name); else by (content, time)
  const batchKey = (s: Schedule) =>
    s.list_id != null
      ? `list_${s.list_id}|${(s.content || "").trim()}|${(s.time || "").trim()}`
      : `${(s.content || "").trim()}|${(s.time || "").trim()}`;
  const groupMap = new Map<string, Schedule[]>();
  filteredSchedules.forEach(s => {
    const key = batchKey(s);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(s);
  });
  const singleSchedules = filteredSchedules.filter(s => (groupMap.get(batchKey(s))?.length ?? 0) === 1);
  const batches = Array.from(groupMap.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      listTitle: list[0].list_title || null,
      content: list[0].content,
      time: list[0].time,
      schedules: list,
    }));

  // Helper to get contact name from phone
  const getContactName = (phone: string) => {
    const contact = contacts.find((c: any) => c.phone === phone);
    return contact?.name || phone;
  };

  // Bulk selection helpers
  const toggleScheduleSelection = (id: number) => {
    setSelectedSchedules(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const listForView = analysisView === "single" ? singleSchedules : filteredSchedules;
  const toggleSelectAll = () => {
    if (selectedSchedules.size === listForView.length) {
      setSelectedSchedules(new Set());
    } else {
      setSelectedSchedules(new Set(listForView.map(s => s.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedSchedules.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedSchedules));
  };

  const handleBulkSend = () => {
    const pendingSelected = filteredSchedules
      .filter(s => selectedSchedules.has(s.id) && s.status === "PENDING")
      .map(s => s.id);
    if (pendingSelected.length === 0) {
      toast.warning("No pending schedules selected");
      return;
    }
    bulkSendMutation.mutate(pendingSelected);
  };

  const selectedCount = selectedSchedules.size;
  const selectedPendingCount = filteredSchedules.filter(
    s => selectedSchedules.has(s.id) && s.status === "PENDING"
  ).length;

  // Handle edit
  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setNewMessage(schedule.content);
    setNewTime(schedule.time.replace(' ', 'T'));
    setTargetType("single");
    setUseExistingContact(false);

    // Extract country code and phone
    if (schedule.phone.startsWith("91")) {
      setCountryCode("91");
      setNewPhone(schedule.phone.slice(2));
    } else {
      setCountryCode("");
      setNewPhone(schedule.phone);
    }

    // Scroll to form
    setTimeout(() => {
      const sidebar = document.querySelector('.custom-scrollbar');
      if (sidebar) sidebar.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleSaveEdit = () => {
    if (!editingSchedule) return;

    const updateData: any = {};
    if (newMessage !== editingSchedule.content) updateData.message = newMessage;
    if (newTime !== editingSchedule.time.replace(' ', 'T')) updateData.time = newTime;

    if (!useExistingContact && newPhone) {
      const finalPhone = combinePhone(countryCode, newPhone);
      if (finalPhone !== editingSchedule.phone) updateData.phone = finalPhone;
    } else if (useExistingContact && selectedContactId) {
      const contact = contacts.find((c: any) => String(c.id) === selectedContactId);
      if (contact && contact.phone !== editingSchedule.phone) updateData.phone = contact.phone;
    }

    if (Object.keys(updateData).length > 0) {
      updateMutation.mutate({ id: editingSchedule.id, data: updateData });
    } else {
      setEditingSchedule(null);
      resetForge();
    }
  };

  // Statistics
  const stats = {
    total: schedules.length,
    pending: schedules.filter(s => s.status === "PENDING").length,
    sent: schedules.filter(s => s.status === "SENT").length,
    failed: schedules.filter(s => s.status === "FAILED").length,
  };

  const normalizedContactSearch = contactSearch.trim().toLowerCase();
  const filteredContacts = normalizedContactSearch
    ? contacts.filter((c: any) => {
      const name = String(c?.name || "").toLowerCase();
      const phone = String(c?.phone || "").toLowerCase();
      return name.includes(normalizedContactSearch) || phone.includes(normalizedContactSearch);
    })
    : contacts;

  // Format date for display
  const formatScheduleDate = (dateTime: string) => {
    try {
      const [date, time] = dateTime.split(' ');
      const dateObj = new Date(date + 'T' + time);
      const now = new Date();
      const diffMs = dateObj.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 0) return "Past";
      if (diffMins < 60) return `In ${diffMins}m`;
      if (diffHours < 24) return `In ${diffHours}h`;
      return `In ${diffDays}d`;
    } catch {
      return dateTime;
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 bottom-0 left-[var(--app-sidebar-width,16rem)] z-[100] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* 1. TOP COMMAND BAR */}
      <div className="h-28 border-b border-border bg-card/50 backdrop-blur-xl px-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            onClick={onClose}
            className="group flex items-center gap-3 text-muted-foreground hover:text-primary font-black uppercase text-xs tracking-widest transition-all"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Return to Hub
          </Button>
          <div className="w-px h-8 bg-border" />
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 dark:from-amber-500/30 dark:to-amber-600/20 flex items-center justify-center border border-amber-500/30 dark:border-amber-500/40 shadow-lg shadow-amber-500/10">
              <Calendar className="w-7 h-7 text-amber-500 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-foreground">Scheduler</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">Active Monitoring</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick Stats */}
          <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-secondary/30 rounded-xl border border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10px] font-bold text-foreground">{stats.pending}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-foreground">{stats.sent}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <span className="text-[10px] font-semibold text-muted-foreground">{stats.total} Total</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Name, phone, message..."
                className="pl-10 h-9 bg-secondary/30 border-border rounded-lg font-medium text-sm"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="relative w-44">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchByListName}
                onChange={e => setSearchByListName(e.target.value)}
                placeholder="List name..."
                className="pl-10 h-9 bg-secondary/30 border-border rounded-lg font-medium text-sm"
              />
              {searchByListName && (
                <button type="button" onClick={() => setSearchByListName("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="w-36 h-9 bg-secondary/30 border-border rounded-lg font-medium text-sm"
              />
              {filterDate && (
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setFilterDate("")} title="Clear date">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <Button onClick={onClose} variant="secondary" className="h-11 w-11 rounded-xl p-0 hover:bg-destructive hover:text-white transition-all">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Create Schedule panel - collapsible */}
        <Collapsible open={createPanelExpanded} onOpenChange={setCreatePanelExpanded} asChild>
          <aside className={cn(
            "border-r border-border bg-gradient-to-b from-secondary/5 to-background overflow-hidden flex flex-col transition-[width] duration-200",
            createPanelExpanded ? "w-[32%] min-w-[440px]" : "w-14 shrink-0"
          )}>
            {!createPanelExpanded && (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/5 transition-colors"
                  title="Expand Create Schedule"
                >
                  <ChevronRight className="w-5 h-5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider [writing-mode:vertical] rotate-180">
                    Create
                  </span>
                </button>
              </CollapsibleTrigger>
            )}
            <CollapsibleContent asChild>
              <div className="w-[440px] min-w-[440px] p-8 overflow-y-auto space-y-6 custom-scrollbar h-full">
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg" title="Minimize Create Schedule">
                          <ChevronLeft className="w-5 h-5" />
                        </Button>
                      </CollapsibleTrigger>
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                        <Zap className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Create Schedule</h3>
                        <p className="text-[10px] text-muted-foreground">Schedule messages for later</p>
                      </div>
                    </div>
                    {(newPhone || newMessage || newTime || selectedListId || selectedContactId) && (
                      <Button variant="ghost" onClick={resetForge} size="sm" className="h-8 text-[10px] font-semibold hover:text-destructive dark:hover:text-rose-400 hover:bg-destructive/10 dark:hover:bg-destructive/20">
                        <Eraser className="w-3.5 h-3.5 mr-1.5" /> Clear
                      </Button>
                    )}
                  </div>

                  <div className="p-6 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl shadow-lg space-y-5">
                    {/* TARGET TYPE SELECTOR */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Recipient Type</label>
                      <div className="flex bg-secondary/50 p-1.5 rounded-xl border border-border">
                        <button
                          onClick={() => { setTargetType("single"); setSelectedListId(""); }}
                          className={cn(
                            "flex-1 py-2.5 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-2",
                            targetType === 'single'
                              ? "bg-background text-primary shadow-sm border border-primary/20"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <User className="w-4 h-4" /> Single Contact
                        </button>
                        <button
                          onClick={() => { setTargetType("list"); setNewPhone(""); setSelectedContactId(""); setUseExistingContact(false); }}
                          className={cn(
                            "flex-1 py-2.5 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-2",
                            targetType === 'list'
                              ? "bg-background text-amber-500 shadow-sm border border-amber-500/20"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Layers className="w-4 h-4" /> List
                        </button>
                      </div>
                    </div>

                    {/* RECIPIENT INPUT */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {targetType === 'single' ? 'Recipient' : 'Select list'}
                      </label>
                      {targetType === 'single' ? (
                        <div className="space-y-3">
                          {/* Toggle between existing contact and new phone */}
                          <div className="flex bg-secondary/50 p-1 rounded-lg border border-border">
                            <button
                              onClick={() => { setUseExistingContact(false); setSelectedContactId(""); }}
                              className={cn(
                                "flex-1 py-2 rounded-md text-[10px] font-semibold transition-all flex items-center justify-center gap-2",
                                !useExistingContact
                                  ? "bg-background text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <User className="w-3.5 h-3.5" /> New Number
                            </button>
                            <button
                              onClick={() => { setUseExistingContact(true); setNewPhone(""); setCountryCode("91"); setContactSearch(""); }}
                              className={cn(
                                "flex-1 py-2 rounded-md text-[10px] font-semibold transition-all flex items-center justify-center gap-2",
                                useExistingContact
                                  ? "bg-background text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Users className="w-3.5 h-3.5" /> Existing Contact
                            </button>
                          </div>

                          {useExistingContact ? (
                            <div className="space-y-1.5">
                              <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                                <SelectTrigger className="h-11 bg-background rounded-xl font-medium text-sm border-border">
                                  <SelectValue placeholder={contactsLoading ? "Loading contacts..." : contacts.length === 0 ? "No contacts available" : "Choose a contact..."} />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                                  {contactsLoading ? (
                                    <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Loading contacts...
                                    </div>
                                  ) : contacts.length === 0 ? (
                                    <div className="px-4 py-3 text-sm text-muted-foreground">
                                      No contacts found. Add contacts in the Contacts section first.
                                    </div>
                                  ) : (
                                    <>
                                      <div
                                        className="p-2 border-b border-border/60 sticky top-0 bg-popover z-10"
                                        onClick={e => e.stopPropagation()}
                                        onKeyDownCapture={e => e.stopPropagation()}
                                      >
                                        <div className="relative">
                                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                          <Input
                                            value={contactSearch}
                                            onChange={e => setContactSearch(e.target.value)}
                                            placeholder="Search by name or number..."
                                            className="h-9 pl-10 pr-9 bg-background rounded-lg font-medium text-sm"
                                          />
                                          {contactSearch && (
                                            <button
                                              type="button"
                                              onClick={() => setContactSearch("")}
                                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                              aria-label="Clear contact search"
                                            >
                                              <X className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {filteredContacts.length === 0 ? (
                                        <div className="px-4 py-3 text-sm text-muted-foreground">
                                          No matching contacts.
                                        </div>
                                      ) : (
                                        filteredContacts.map((contact: any) => (
                                          <SelectItem
                                            key={contact.id}
                                            value={String(contact.id)}
                                            className="font-medium text-sm cursor-pointer"
                                          >
                                            <div className="flex items-center justify-between w-full">
                                              <div className="flex flex-col">
                                                <span className="font-semibold">{contact.name || "Unknown"}</span>
                                                <span className="text-xs text-muted-foreground">{contact.phone}</span>
                                              </div>
                                              {contact.stage && (
                                                <Badge variant="outline" className="ml-2 text-[9px] h-5">
                                                  {contact.stage}
                                                </Badge>
                                              )}
                                            </div>
                                          </SelectItem>
                                        ))
                                      )}
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                              {selectedContactId && (
                                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                                  <Info className="w-3 h-3" />
                                  {contacts.find((c: any) => String(c.id) === selectedContactId)?.phone || ""}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-3">
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">+</span>
                                    <Input
                                      value={countryCode}
                                      onChange={e => setCountryCode(e.target.value)}
                                      placeholder="91"
                                      className="h-11 pl-6 bg-background rounded-xl font-semibold text-sm text-center"
                                    />
                                  </div>
                                </div>
                                <div className="col-span-9">
                                  <Input
                                    value={newPhone}
                                    onChange={e => setNewPhone(e.target.value)}
                                    placeholder="9876543210"
                                    className="h-11 bg-background rounded-xl font-medium text-sm"
                                  />
                                </div>
                              </div>
                              {newPhone && (
                                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                                  <Info className="w-3 h-3" />
                                  Full number: +{countryCode}{newPhone}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Select value={selectedListId} onValueChange={setSelectedListId}>
                            <SelectTrigger className="h-11 bg-background rounded-xl font-medium text-sm border-border">
                              <SelectValue placeholder={listsLoading ? "Loading segments..." : lists.length === 0 ? "No segments available" : "Choose a segment..."} />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                              {listsLoading ? (
                                <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Loading segments...
                                </div>
                              ) : listsError ? (
                                <div className="px-4 py-3 text-sm text-destructive">
                                  Error loading segments. Please try again.
                                </div>
                              ) : lists.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-muted-foreground">
                                  No lists found. Create one in Lists first.
                                </div>
                              ) : (
                                lists.map((l: any) => (
                                  <SelectItem
                                    key={l.id}
                                    value={String(l.id)}
                                    className="font-medium text-sm cursor-pointer"
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span>{l.title}</span>
                                      <Badge variant="outline" className="ml-2 text-[9px] h-5">
                                        {l.count || 0} leads
                                      </Badge>
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {selectedListId && lists.length > 0 && (
                            <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              {lists.find((l: any) => String(l.id) === selectedListId)?.count || 0} contacts will receive this message
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* RECURRENCE TYPE */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Repeat</label>
                      <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
                        <SelectTrigger className="h-11 bg-background rounded-xl font-medium text-sm border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border z-[200]">
                          <SelectItem value="once" className="text-sm">Once (single date & time)</SelectItem>
                          <SelectItem value="daily" className="text-sm">Every day</SelectItem>
                          <SelectItem value="every_n_days" className="text-sm">Every N days</SelectItem>
                          <SelectItem value="weekly" className="text-sm">Weekly (specific days)</SelectItem>
                          <SelectItem value="hourly" className="text-sm">Every hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* TIME INPUT - dynamic by recurrence */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {recurrenceType === "once" && "Schedule Date & Time"}
                        {recurrenceType === "daily" && "Time (every day)"}
                        {recurrenceType === "every_n_days" && "Start date & repeat interval"}
                        {recurrenceType === "weekly" && "Day(s) & time"}
                        {recurrenceType === "hourly" && "At minute (each hour)"}
                      </label>
                      <div className="space-y-1.5">
                        {recurrenceType === "once" && (
                          <>
                            <Input
                              type="datetime-local"
                              value={newTime}
                              onChange={e => setNewTime(e.target.value)}
                              className="h-11 bg-background rounded-xl font-medium text-sm [&::-webkit-calendar-picker-indicator]:invert-[50%] [&::-webkit-calendar-picker-indicator]:hover:opacity-70"
                              min={new Date().toISOString().slice(0, 16)}
                            />
                            {newTime && (
                              <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                <span>Local: {new Date(newTime).toLocaleString()}</span>
                              </div>
                            )}
                          </>
                        )}
                        {recurrenceType === "daily" && (
                          <>
                            <Input
                              type="time"
                              value={recurrenceTimeOnly}
                              onChange={e => setRecurrenceTimeOnly(e.target.value)}
                              className="h-11 bg-background rounded-xl font-medium text-sm"
                            />
                            <p className="text-[9px] text-muted-foreground">First run: next occurrence of this time (today or tomorrow)</p>
                          </>
                        )}
                        {recurrenceType === "every_n_days" && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground shrink-0">Every</span>
                              <Input
                                type="number"
                                min={1}
                                max={365}
                                value={intervalDays}
                                onChange={e => setIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="h-11 w-20 bg-background rounded-xl font-medium text-sm text-center"
                              />
                              <span className="text-xs text-muted-foreground shrink-0">days</span>
                            </div>
                            <Input
                              type="datetime-local"
                              value={newTime}
                              onChange={e => setNewTime(e.target.value)}
                              className="h-11 bg-background rounded-xl font-medium text-sm [&::-webkit-calendar-picker-indicator]:invert-[50%]"
                              min={new Date().toISOString().slice(0, 16)}
                            />
                            {newTime && (
                              <p className="text-[9px] text-muted-foreground">Start: {new Date(newTime).toLocaleString()}</p>
                            )}
                          </>
                        )}
                        {recurrenceType === "weekly" && (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => toggleDayOfWeek(i)}
                                  className={cn(
                                    "h-8 px-2.5 rounded-lg text-[10px] font-semibold border transition-all",
                                    daysOfWeek.includes(i)
                                      ? "bg-amber-500 text-white border-amber-600"
                                      : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                                  )}
                                >
                                  {day}
                                </button>
                              ))}
                            </div>
                            {daysOfWeek.length > 0 && (
                              <Input
                                type="time"
                                value={recurrenceTimeOnly}
                                onChange={e => setRecurrenceTimeOnly(e.target.value)}
                                className="h-11 bg-background rounded-xl font-medium text-sm"
                              />
                            )}
                            {daysOfWeek.length === 0 && (
                              <p className="text-[9px] text-amber-600 dark:text-amber-400">Select at least one day</p>
                            )}
                          </>
                        )}
                        {recurrenceType === "hourly" && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground shrink-0">At minute</span>
                              <Input
                                type="number"
                                min={0}
                                max={59}
                                value={hourlyMinute}
                                onChange={e => setHourlyMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                                className="h-11 w-20 bg-background rounded-xl font-medium text-sm text-center"
                              />
                              <span className="text-xs text-muted-foreground shrink-0">past each hour</span>
                            </div>
                            <p className="text-[9px] text-muted-foreground">First run: next hour at :{String(hourlyMinute).padStart(2, "0")}</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* PAYLOAD INPUT */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Message Content</label>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPreview(!showPreview)}
                            className="h-7 text-[9px] font-medium"
                          >
                            {showPreview ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                            {showPreview ? "Hide" : "Preview"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowLibrary(true)}
                            className="h-7 text-[9px] font-medium"
                          >
                            <Library className="w-3.5 h-3.5 mr-1" /> Templates
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMessageDraft(newMessage);
                              setMessageDraftPreview(false);
                              setMessageEditorOpen(true);
                            }}
                            className="h-7 text-[9px] font-medium"
                            title="Open large editor"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" /> Expand
                          </Button>
                        </div>
                      </div>
                      {showPreview && newMessage ? (
                        <div className="min-h-[150px] bg-muted/30 border border-border rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
                          {newMessage}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Textarea
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Type your message here..."
                            className="min-h-[150px] bg-background border-border rounded-xl p-4 text-sm resize-none font-normal leading-relaxed"
                          />
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                            <span>{newMessage.length} characters</span>
                            {newMessage.length > 0 && (
                              <button
                                onClick={() => copyToClipboard(newMessage)}
                                className="flex items-center gap-1 hover:text-foreground transition-colors"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2">
                      {editingSchedule ? (
                        <Button
                          onClick={handleSaveEdit}
                          disabled={updateMutation.isPending || !newMessage || !newTime || (targetType === "single" && !useExistingContact && !newPhone) || (targetType === "single" && useExistingContact && !selectedContactId)}
                          className="w-full h-12 rounded-xl font-semibold text-sm !bg-amber-600 dark:!bg-amber-500 hover:!bg-amber-700 dark:hover:!bg-amber-600 !text-white shadow-lg shadow-amber-500/30 dark:shadow-amber-500/40 transition-all active:scale-[0.98]"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Update Schedule
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => createMutation.mutate()}
                          disabled={
                            createMutation.isPending ||
                            !newMessage ||
                            (recurrenceType === "once" && !newTime) ||
                            (recurrenceType === "every_n_days" && !newTime) ||
                            (recurrenceType === "weekly" && daysOfWeek.length === 0) ||
                            (targetType === "single" && !useExistingContact && !newPhone) ||
                            (targetType === "single" && useExistingContact && !selectedContactId) ||
                            (targetType === "list" && !selectedListId)
                          }
                          className="w-full h-12 rounded-xl font-semibold text-sm !bg-amber-600 dark:!bg-amber-500 hover:!bg-amber-700 dark:hover:!bg-amber-600 !text-white shadow-lg shadow-amber-500/30 dark:shadow-amber-500/40 transition-all active:scale-[0.98]"
                        >
                          {createMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Scheduling...
                            </>
                          ) : (
                            <>
                              <Calendar className="w-4 h-4 mr-2" />
                              Schedule Message
                            </>
                          )}
                        </Button>
                      )}
                      {(!newMessage ||
                        (recurrenceType === "once" && !newTime) ||
                        (recurrenceType === "every_n_days" && !newTime) ||
                        (recurrenceType === "weekly" && daysOfWeek.length === 0) ||
                        (targetType === "single" && !useExistingContact && !newPhone) ||
                        (targetType === "single" && useExistingContact && !selectedContactId) ||
                        (targetType === "list" && !selectedListId)) && (
                        <p className="text-[9px] text-muted-foreground text-center">
                          Fill all fields to schedule
                        </p>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </CollapsibleContent>
          </aside>
        </Collapsible>

        {/* Scheduled messages list - with analysis view (All | Single | Bulk) */}
        <main className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-background flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold text-foreground">Scheduled Messages</h3>
              <Tabs value={analysisView} onValueChange={(v) => setAnalysisView(v as "all" | "single" | "bulk")}>
                <TabsList className="h-9 bg-secondary/30 border border-border rounded-lg p-0.5">
                  <TabsTrigger value="all" className="text-xs px-4 rounded-md text-foreground data-[state=active]:bg-amber-600 dark:data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-amber-700/30">
                    All ({stats.total})
                  </TabsTrigger>
                  <TabsTrigger value="single" className="text-xs px-4 rounded-md text-foreground data-[state=active]:bg-amber-600 dark:data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-amber-700/30">
                    Single ({singleSchedules.length})
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="text-xs px-4 rounded-md text-foreground data-[state=active]:bg-amber-600 dark:data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 dark:data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-amber-700/30">
                    Bulk ({batches.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <p className="text-xs text-muted-foreground">
              {analysisView === "all" && `${filteredSchedules.length} of ${stats.total} scheduled`}
              {analysisView === "single" && `${singleSchedules.length} one-off schedule${singleSchedules.length !== 1 ? "s" : ""}`}
              {analysisView === "bulk" && `${batches.length} batch${batches.length !== 1 ? "es" : ""} (${batches.reduce((a, b) => a + b.schedules.length, 0)} total)`}
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div />
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 bg-secondary/30 dark:bg-secondary/50 p-1 rounded-lg border border-border">
                {["All", "Pending", "Sent", "Failed"].map(cat => (
                  <Button
                    key={cat}
                    variant={statusFilter === cat ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter(cat)}
                    className={cn(
                      "h-8 px-4 rounded-md text-[10px] font-semibold transition-all",
                      statusFilter === cat
                        ? "bg-amber-500 dark:bg-amber-600 text-white shadow-sm"
                        : "text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-secondary/50 dark:hover:bg-secondary/70"
                    )}
                  >
                    {cat}
                    {cat !== "All" && (
                      <span className={cn(
                        "ml-1.5 px-1.5 py-0.5 rounded text-[9px]",
                        statusFilter === cat
                          ? "bg-white/20 dark:bg-white/10"
                          : "bg-background/20 dark:bg-background/30"
                      )}>
                        {cat === "Pending" ? stats.pending : cat === "Sent" ? stats.sent : stats.failed}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* BULK VIEW: batch cards */}
          {analysisView === "bulk" && (
            <div className="space-y-4 pb-20">
              {batches.length === 0 ? (
                <div className="py-20 text-center opacity-20">
                  <Layers className="w-16 h-16 mx-auto mb-6" />
                  <p className="text-sm text-muted-foreground">No bulk batches</p>
                  <p className="text-xs text-muted-foreground mt-1">Schedules sent to multiple contacts at the same time appear here</p>
                </div>
              ) : batches.map(({ key, listTitle, content, time, schedules }) => {
                const expanded = expandedBatchKey === key;
                const pending = schedules.filter(s => s.status === "PENDING").length;
                const sent = schedules.filter(s => s.status === "SENT").length;
                const failed = schedules.filter(s => s.status === "FAILED").length;
                return (
                  <div
                    key={key}
                    className="bg-card/50 border border-border/50 rounded-xl overflow-hidden hover:border-amber-500/30 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBatchKey(expanded ? null : key)}
                      className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {listTitle ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-sm font-semibold border border-amber-500/20">
                              <Layers className="w-4 h-4" />
                              {listTitle}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground font-medium">Message batch</span>
                          )}
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{content.slice(0, 50)}{content.length > 50 ? "…" : ""}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {time}</span>
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {schedules.length} recipients</span>
                          {pending > 0 && <span className="text-amber-600 dark:text-amber-400">{pending} Pending</span>}
                          {sent > 0 && <span className="text-emerald-600 dark:text-emerald-400">{sent} Sent</span>}
                          {failed > 0 && <span className="text-rose-600 dark:text-rose-400">{failed} Failed</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pending > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            onClick={(e) => { e.stopPropagation(); bulkSendMutation.mutate(schedules.filter(s => s.status === "PENDING").map(s => s.id)); }}
                            disabled={bulkSendMutation.isPending}
                          >
                            Send {pending} Now
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          {expanded ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4 -rotate-90" />}
                        </Button>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-border/50 bg-muted/20 px-6 py-4">
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {schedules.map(msg => (
                            <div
                              key={msg.id}
                              className={cn(
                                "flex items-center justify-between gap-4 py-2 px-3 rounded-lg",
                                msg.status === "PENDING" && "bg-amber-500/5",
                                msg.status === "SENT" && "bg-emerald-500/5",
                                msg.status === "FAILED" && "bg-rose-500/5"
                              )}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{getContactName(msg.phone)}</p>
                                <p className="text-xs text-muted-foreground truncate">{msg.phone}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge className={cn(
                                  "text-[9px]",
                                  msg.status === "PENDING" && "bg-amber-500/20 text-amber-700 dark:text-amber-400",
                                  msg.status === "SENT" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                                  msg.status === "FAILED" && "bg-rose-500/20 text-rose-700 dark:text-rose-400"
                                )}>{msg.status}</Badge>
                                {msg.status === "PENDING" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => retryMutation.mutate(msg.id)} disabled={retryMutation.isPending}>
                                    <Play className="w-3.5 h-3.5 text-emerald-500" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(msg.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/50 flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => bulkDeleteMutation.mutate(schedules.map(s => s.id))}
                            disabled={bulkDeleteMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete entire batch
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* BULK ACTIONS BAR (for All / Single list) */}
          {analysisView !== "bulk" && selectedCount > 0 && (
            <div className="mb-4 px-6 py-3 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-500/40 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm font-semibold text-foreground">
                    {selectedCount} schedule{selectedCount !== 1 ? 's' : ''} selected
                  </span>
                </div>
                {selectedPendingCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({selectedPendingCount} pending)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedPendingCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkSend}
                    disabled={bulkSendMutation.isPending}
                    className="h-8 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-semibold"
                  >
                    {bulkSendMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                        Send {selectedPendingCount} Now
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  className="h-8 px-3 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive dark:text-rose-400 border-destructive/20 text-[10px] font-semibold"
                >
                  {bulkDeleteMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete {selectedCount}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSchedules(new Set())}
                  className="h-8 px-3 rounded-lg text-[10px] font-semibold"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* LIST HEADERS (All / Single view only) - compact grid like Contacts */}
          {analysisView !== "bulk" && (
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center">
              <div className="col-span-1 flex justify-center">
                <button
                  onClick={toggleSelectAll}
                  className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-all hover:opacity-80",
                    selectedSchedules.size === listForView.length && listForView.length > 0
                      ? "bg-blue-500 border-blue-500"
                      : "border-muted-foreground/50 hover:border-blue-500/50"
                  )}
                  title="Select all"
                >
                  {selectedSchedules.size === listForView.length && listForView.length > 0 && (
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  )}
                </button>
              </div>
              <div className="col-span-2 font-semibold">Recipient</div>
              <div className="col-span-2 font-semibold">Message</div>
              <div className="col-span-2 text-center font-semibold">Scheduled</div>
              <div className="col-span-2 text-center font-semibold">Time Until</div>
              <div className="col-span-3 text-right font-semibold">Actions</div>
            </div>
          )}

          <div className={cn("space-y-0 pb-20", analysisView === "bulk" && "hidden")}>
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center opacity-30">
                <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                <p className="mt-4 text-sm text-muted-foreground">Loading schedule...</p>
              </div>
            ) : listForView.length === 0 ? (
              <div className="py-20 text-center opacity-20">
                <MessageSquare className="w-16 h-16 mx-auto mb-6" />
                <p className="text-sm text-muted-foreground">
                  {analysisView === "single" ? "No single-contact schedules" : "No scheduled messages"}
                </p>
              </div>
            ) : listForView.map((msg) => {
              const isExpanded = expandedSchedule === msg.id;
              const isSelected = selectedSchedules.has(msg.id);
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "grid grid-cols-12 gap-4 items-center px-4 py-2.5 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30",
                    msg.status === "FAILED" && "bg-rose-500/5",
                    msg.status === "PENDING" && "bg-amber-500/5",
                    msg.status === "SENT" && "bg-emerald-500/5",
                    isSelected && "bg-primary/5 border-l-2 border-l-primary",
                    isExpanded && "bg-muted/20"
                  )}
                >
                  {/* CHECKBOX */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => toggleScheduleSelection(msg.id)}
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center transition-all hover:opacity-80",
                        isSelected
                          ? "bg-blue-500 border-blue-500"
                          : "border-muted-foreground/50 hover:border-blue-500/50"
                      )}
                      title="Select schedule"
                    >
                      {isSelected && (
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      )}
                    </button>
                  </div>

                  {/* RECIPIENT */}
                  <div className="col-span-2 flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      msg.status === "PENDING" ? "bg-amber-500 animate-pulse" :
                        msg.status === "SENT" ? "bg-emerald-500" :
                          "bg-rose-500"
                    )} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-foreground truncate">{getContactName(msg.phone)}</span>
                      {getContactName(msg.phone) !== msg.phone && (
                        <span className="text-[10px] text-muted-foreground truncate whitespace-nowrap overflow-hidden text-ellipsis">{msg.phone}</span>
                      )}
                    </div>
                  </div>

                  {/* PAYLOAD */}
                  <div className="col-span-2 min-w-0">
                    <button
                      onClick={() => setExpandedSchedule(isExpanded ? null : msg.id)}
                      className="text-left w-full block"
                    >
                      <p className={cn(
                        "text-xs text-muted-foreground font-medium",
                        !isExpanded && "truncate"
                      )}>
                        {msg.content}
                      </p>
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 p-2.5 bg-muted/30 rounded-lg border border-border/50">
                        <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(msg.content); }}
                          className="h-6 text-[10px] mt-1.5"
                        >
                          <Copy className="w-3 h-3 mr-1" /> Copy
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* TIME */}
                  <div className="col-span-2 text-center">
                    <div className="text-xs font-semibold text-foreground whitespace-nowrap">{msg.time.split(' ')[0]}</div>
                    <span className="text-[10px] text-muted-foreground font-mono">{msg.time.split(' ')[1] || ""}</span>
                    {(msg.recurrence_type && msg.recurrence_type !== "once") && (
                      <Badge variant="secondary" className="mt-0.5 text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                        {msg.recurrence_type === "daily" && "Daily"}
                        {msg.recurrence_type === "every_n_days" && "Every N days"}
                        {msg.recurrence_type === "weekly" && "Weekly"}
                        {msg.recurrence_type === "hourly" && "Hourly"}
                      </Badge>
                    )}
                  </div>

                  {/* TIME UNTIL */}
                  <div className="col-span-2 text-center">
                    <span className="text-xs font-medium text-foreground">{formatScheduleDate(msg.time)}</span>
                  </div>

                  {/* STATUS & CONTROL */}
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    {msg.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const numericId = Number(msg.id);
                          retryMutation.mutate(numericId);
                        }}
                        disabled={retryMutation.isPending}
                        className="h-7 w-7 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-all shrink-0"
                        title="Send now"
                      >
                        {retryMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}

                    <Badge className={cn(
                      "h-6 px-2 text-[9px] font-semibold rounded-md shadow-sm flex items-center gap-1 shrink-0",
                      msg.status === "PENDING"
                        ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 dark:border-amber-500/40" :
                        msg.status === "SENT"
                          ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 dark:border-emerald-500/40" :
                          "bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30 dark:border-rose-500/40"
                    )}>
                      {msg.status === "SENT" && <CheckCircle2 className="w-3 h-3" />}
                      {msg.status === "FAILED" && <XCircle className="w-3 h-3" />}
                      {msg.status === "PENDING" && <Timer className="w-3 h-3" />}
                      {msg.status}
                    </Badge>

                    {msg.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(msg)}
                        className="h-7 w-7 rounded-md hover:bg-primary/10 dark:hover:bg-primary/20 text-primary dark:text-primary transition-all shrink-0"
                        title="Edit schedule"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(msg.id)}
                      className="h-7 w-7 rounded-md hover:bg-destructive/10 dark:hover:bg-destructive/20 text-destructive dark:text-rose-400 transition-all shrink-0"
                      title="Delete schedule"
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

      {/* TEMPLATE LIBRARY MODAL */}
      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Library className="w-5 h-5 text-primary" />
              Template Library
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Choose a template to load into your message. Click on any template to use it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto custom-scrollbar mt-4">
            {templates.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Library className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No templates available</p>
                <p className="text-xs mt-1">Create templates in the Templates section to use them here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleLoadTemplate(t)}
                    className="group p-5 bg-card/50 border border-border/50 rounded-xl text-left hover:border-primary/50 hover:bg-card/80 hover:shadow-lg transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h4 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {t.title}
                      </h4>
                      {t.category && (
                        <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                          {t.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 group-hover:text-foreground/80 transition-colors">
                      "{t.body}"
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span className="font-medium">Click to use this template</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MESSAGE EDITOR MODAL */}
      <Dialog
        open={messageEditorOpen}
        onOpenChange={(open) => {
          // If user closes, keep draft but don't overwrite main message unless saved.
          setMessageEditorOpen(open);
          if (!open) setMessageDraftPreview(false);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <MessageSquare className="w-5 h-5 text-primary" />
              Message Editor
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Write and preview your message comfortably, then save it back to the schedule.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMessageDraftPreview(p => !p)}
                className="h-9 rounded-lg"
              >
                {messageDraftPreview ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {messageDraftPreview ? "Hide preview" : "Preview"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!messageDraft) return;
                  copyToClipboard(messageDraft);
                }}
                className="h-9 rounded-lg"
                disabled={!messageDraft}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              {messageDraft.length} characters
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar mt-3">
            {messageDraftPreview ? (
              <div className="min-h-[45vh] bg-muted/30 border border-border rounded-xl p-5 text-sm leading-relaxed whitespace-pre-wrap">
                {messageDraft || "Nothing to preview yet…"}
              </div>
            ) : (
              <Textarea
                value={messageDraft}
                onChange={e => setMessageDraft(e.target.value)}
                placeholder="Type your message here..."
                className="min-h-[55vh] bg-background border-border rounded-xl p-5 text-sm resize-none font-normal leading-relaxed"
              />
            )}
          </div>

          <div className="pt-4 border-t border-border/60 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMessageEditorOpen(false);
                setMessageDraftPreview(false);
              }}
              className="h-10 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setNewMessage(messageDraft);
                setShowPreview(false);
                setMessageEditorOpen(false);
                setMessageDraftPreview(false);
                toast.success("Message updated");
              }}
              className="h-10 rounded-lg !bg-amber-600 dark:!bg-amber-500 hover:!bg-amber-700 dark:hover:!bg-amber-600 !text-white"
              disabled={!messageDraft.trim()}
            >
              <Save className="w-4 h-4 mr-2" />
              Save message
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #f59e0b; }

        /* Ensure Template Library dialog appears above Scheduler overlay */
        [data-radix-dialog-overlay] { z-index: 300 !important; }
        [data-radix-dialog-content] { z-index: 301 !important; }
      `}</style>
    </div>
  );
}