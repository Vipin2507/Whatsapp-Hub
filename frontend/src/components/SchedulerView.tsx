import { useState, useEffect } from "react";
import {
  X,
  Search,
  Calendar,
  Clock,
  Library,
  Loader2,
  Trash2,
  ChevronLeft,
  User,
  Users,
  MessageSquare,
  Save,
  Copy,
  Eye,
  EyeOff,
  Edit3,
  Play,
  Layers,
  Eraser,
  CheckSquare,
  Square,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Schedule, Template, RecurrenceType, RecurrenceConfig, Contact, LeadList } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StatusPill } from "@/components/PendingChip";
import { useAppPreferences } from "@/hooks/use-app-settings";
import { DateField, DateTimeField, TimeField } from "@/components/DateFields";

interface SchedulerViewProps {
  isOpen: boolean;
  onClose: () => void;
}

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function chipClass(active: boolean) {
  return cn(
    "h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium",
    active
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
  );
}

function statusTone(status: string) {
  switch (status.toUpperCase()) {
    case "PENDING":
      return "warning" as const;
    case "SENT":
      return "success" as const;
    case "FAILED":
      return "danger" as const;
    default:
      return "muted" as const;
  }
}

function recurrenceLabel(type?: RecurrenceType | string | null) {
  switch (type) {
    case "daily":
      return "Daily";
    case "every_n_days":
      return "Every N days";
    case "weekly":
      return "Weekly";
    case "hourly":
      return "Hourly";
    default:
      return null;
  }
}

function formatScheduleDate(dateTime: string) {
  try {
    const [date, time] = dateTime.split(" ");
    const dateObj = new Date(`${date}T${time}`);
    const diffMins = Math.floor((dateObj.getTime() - Date.now()) / 60000);
    if (diffMins < 0) return "Past";
    if (diffMins < 60) return `In ${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `In ${diffHours}h`;
    return `In ${Math.floor(diffHours / 24)}d`;
  } catch {
    return dateTime;
  }
}

export function SchedulerView({ isOpen, onClose }: SchedulerViewProps) {
  const queryClient = useQueryClient();
  const prefs = useAppPreferences();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedSchedule, setExpandedSchedule] = useState<number | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedSchedules, setSelectedSchedules] = useState<Set<number>>(new Set());
  const [analysisView, setAnalysisView] = useState<"all" | "single" | "bulk">("all");
  const [expandedBatchKey, setExpandedBatchKey] = useState<string | null>(null);
  const [searchByListName, setSearchByListName] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const [targetType, setTargetType] = useState<"single" | "list">("single");
  const [selectedListId, setSelectedListId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [countryCode, setCountryCode] = useState(prefs.default_country_code);
  const [useExistingContact, setUseExistingContact] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [messageEditorOpen, setMessageEditorOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageDraftPreview, setMessageDraftPreview] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("once");
  const [intervalDays, setIntervalDays] = useState(2);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [recurrenceTimeOnly, setRecurrenceTimeOnly] = useState("09:00");
  const [hourlyMinute, setHourlyMinute] = useState(0);

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
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!editingSchedule) setCountryCode(prefs.default_country_code);
  }, [prefs.default_country_code, editingSchedule]);

  const combinePhone = (cc: string, ph: string) => `${cc.replace(/\D/g, "")}${ph.replace(/\D/g, "")}`;

  const resetForge = () => {
    setNewPhone("");
    setNewTime("");
    setNewMessage("");
    setSelectedListId("");
    setCountryCode(prefs.default_country_code);
    setUseExistingContact(false);
    setSelectedContactId("");
    setEditingSchedule(null);
    setRecurrenceType("once");
    setRecurrenceTimeOnly("09:00");
    setIntervalDays(2);
    setDaysOfWeek([]);
    setHourlyMinute(0);
  };

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
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      for (let i = 0; i <= 8; i++) {
        if (daysOfWeek.includes(d.getDay()) && d > now) {
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      }
      let finalPhone = "";
      if (useExistingContact && selectedContactId) {
        const contact = contacts.find((c) => String(c.id) === selectedContactId);
        if (!contact) throw new Error("Selected contact not found");
        finalPhone = contact.phone;
      } else {
        if (!newPhone) throw new Error("Phone number is required");
        finalPhone = combinePhone(countryCode, newPhone);
      }
      if (!finalPhone) throw new Error("Recipient phone number is required");
      return api.schedule.create({ phone: finalPhone, ...payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      resetForge();
      toast.success("Message scheduled");
    },
    onError: (err: Error) => toast.error(err.message || "Could not schedule"),
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => api.schedule.retry(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Sent now");
    },
    onError: (err: Error) => toast.error(err.message || "Could not send"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { phone?: string; message?: string; time?: string } }) =>
      api.schedule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setEditingSchedule(null);
      resetForge();
      toast.success("Schedule saved");
    },
    onError: (err: Error) => toast.error(err.message || "Could not save"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.schedule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Schedule removed");
    },
    onError: () => toast.error("Could not remove"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.schedule.delete(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { success: ids.length - failed, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setSelectedSchedules(new Set());
      if (result.failed === 0) toast.success(`${result.success} removed`);
      else toast.warning(`${result.success} removed, ${result.failed} failed`);
    },
    onError: () => toast.error("Could not delete"),
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.schedule.retry(Number(id))));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { success: ids.length - failed, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setSelectedSchedules(new Set());
      if (result.failed === 0) toast.success(`${result.success} sent`);
      else toast.warning(`${result.success} sent, ${result.failed} failed`);
    },
    onError: () => toast.error("Could not send"),
  });

  const toggleDayOfWeek = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const handleLoadTemplate = (t: Template) => {
    setNewMessage(t.body);
    setShowLibrary(false);
    setMessageDraft(t.body);
    toast.success("Template loaded");
  };

  const scheduleDatePart = (m: Schedule) => (m.time || "").trim().split(" ")[0] || "";

  const filteredSchedules = schedules.filter((m) => {
    const contact = contacts.find((c) => c.phone === m.phone);
    const contactName = contact?.name || "";
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      m.phone.includes(searchQuery) ||
      m.content.toLowerCase().includes(q) ||
      contactName.toLowerCase().includes(q);
    const matchesListName =
      !searchByListName.trim() || (m.list_title || "").toLowerCase().includes(searchByListName.toLowerCase());
    const matchesDate = !filterDate.trim() || scheduleDatePart(m) === filterDate;
    const matchesStatus = statusFilter === "All" || m.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesListName && matchesDate && matchesStatus;
  });

  const batchKey = (s: Schedule) =>
    s.list_id != null
      ? `list_${s.list_id}|${(s.content || "").trim()}|${(s.time || "").trim()}`
      : `${(s.content || "").trim()}|${(s.time || "").trim()}`;

  const groupMap = new Map<string, Schedule[]>();
  filteredSchedules.forEach((s) => {
    const key = batchKey(s);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(s);
  });
  const singleSchedules = filteredSchedules.filter((s) => (groupMap.get(batchKey(s))?.length ?? 0) === 1);
  const batches = Array.from(groupMap.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      listTitle: list[0].list_title || null,
      content: list[0].content,
      time: list[0].time,
      schedules: list,
    }));

  const getContactName = (phone: string) => contacts.find((c) => c.phone === phone)?.name || phone;

  const toggleScheduleSelection = (id: number) => {
    setSelectedSchedules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const listForView = analysisView === "single" ? singleSchedules : filteredSchedules;
  const toggleSelectAll = () => {
    if (selectedSchedules.size === listForView.length) setSelectedSchedules(new Set());
    else setSelectedSchedules(new Set(listForView.map((s) => s.id)));
  };

  const handleBulkDelete = () => {
    if (selectedSchedules.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedSchedules));
  };

  const handleBulkSend = () => {
    const pendingSelected = filteredSchedules
      .filter((s) => selectedSchedules.has(s.id) && s.status === "PENDING")
      .map((s) => s.id);
    if (pendingSelected.length === 0) {
      toast.warning("No pending schedules selected");
      return;
    }
    bulkSendMutation.mutate(pendingSelected);
  };

  const selectedCount = selectedSchedules.size;
  const selectedPendingCount = filteredSchedules.filter(
    (s) => selectedSchedules.has(s.id) && s.status === "PENDING",
  ).length;

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setNewMessage(schedule.content);
    setNewTime(schedule.time.replace(" ", "T"));
    setTargetType("single");
    setUseExistingContact(false);
    if (schedule.phone.startsWith(prefs.default_country_code)) {
      setCountryCode(prefs.default_country_code);
      setNewPhone(schedule.phone.slice(prefs.default_country_code.length));
    } else if (schedule.phone.startsWith("91") && prefs.default_country_code !== "91") {
      setCountryCode("91");
      setNewPhone(schedule.phone.slice(2));
    } else {
      setCountryCode("");
      setNewPhone(schedule.phone);
    }
    setTimeout(() => {
      document.querySelector(".app-split-side")?.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  const handleSaveEdit = () => {
    if (!editingSchedule) return;
    const updateData: { phone?: string; message?: string; time?: string } = {};
    if (newMessage !== editingSchedule.content) updateData.message = newMessage;
    if (newTime !== editingSchedule.time.replace(" ", "T")) updateData.time = newTime;
    if (!useExistingContact && newPhone) {
      const finalPhone = combinePhone(countryCode, newPhone);
      if (finalPhone !== editingSchedule.phone) updateData.phone = finalPhone;
    } else if (useExistingContact && selectedContactId) {
      const contact = contacts.find((c) => String(c.id) === selectedContactId);
      if (contact && contact.phone !== editingSchedule.phone) updateData.phone = contact.phone;
    }
    if (Object.keys(updateData).length > 0) {
      updateMutation.mutate({ id: editingSchedule.id, data: updateData });
    } else {
      setEditingSchedule(null);
      resetForge();
    }
  };

  const stats = {
    total: schedules.length,
    pending: schedules.filter((s) => s.status === "PENDING").length,
    sent: schedules.filter((s) => s.status === "SENT").length,
    failed: schedules.filter((s) => s.status === "FAILED").length,
  };

  const normalizedContactSearch = contactSearch.trim().toLowerCase();
  const filteredContacts = normalizedContactSearch
    ? contacts.filter((c) => {
        const name = String(c.name || "").toLowerCase();
        const phone = String(c.phone || "").toLowerCase();
        return name.includes(normalizedContactSearch) || phone.includes(normalizedContactSearch);
      })
    : contacts;

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!ok) throw new Error("Copy failed");
      }
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const createDisabled =
    createMutation.isPending ||
    !newMessage ||
    (recurrenceType === "once" && !newTime) ||
    (recurrenceType === "every_n_days" && !newTime) ||
    (recurrenceType === "weekly" && daysOfWeek.length === 0) ||
    (targetType === "single" && !useExistingContact && !newPhone) ||
    (targetType === "single" && useExistingContact && !selectedContactId) ||
    (targetType === "list" && !selectedListId);

  const editDisabled =
    updateMutation.isPending ||
    !newMessage ||
    !newTime ||
    (targetType === "single" && !useExistingContact && !newPhone) ||
    (targetType === "single" && useExistingContact && !selectedContactId);

  if (!isOpen) return null;

  return (
    <div className="app-overlay z-[100]">
      <header className="app-overlay-header">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 gap-1 text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="hidden h-5 w-px bg-border sm:block" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
              <Calendar className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight">Scheduler</h2>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {stats.pending} pending · {stats.total} total
              </p>
            </div>
          </div>
        </div>
        <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:max-w-sm">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, message"
              className="h-9 pl-8"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0 text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="app-split">
        <aside className="app-split-side chat-scroll max-h-[46dvh] space-y-3 lg:max-h-none">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {editingSchedule ? "Edit schedule" : "New schedule"}
            </h3>
            {(newPhone || newMessage || newTime || selectedListId || selectedContactId || editingSchedule) && (
              <Button variant="ghost" size="sm" onClick={resetForge} className="h-7 px-2 text-[11px] text-muted-foreground">
                <Eraser className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>

          <div className="card-soft space-y-3 p-4">
            {editingSchedule ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning-foreground">
                Editing #{editingSchedule.id}
              </p>
            ) : null}

            <div className="space-y-1">
              <label className={fieldLabel}>Recipient</label>
              <div className="flex rounded-md border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("single");
                    setSelectedListId("");
                  }}
                  className={cn("flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium", targetType === "single" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  <User className="h-3.5 w-3.5" />
                  Contact
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("list");
                    setNewPhone("");
                    setSelectedContactId("");
                    setUseExistingContact(false);
                  }}
                  className={cn("flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium", targetType === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  <Layers className="h-3.5 w-3.5" />
                  List
                </button>
              </div>
            </div>

            {targetType === "single" ? (
              <div className="space-y-2">
                <div className="flex rounded-md border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setUseExistingContact(false);
                      setSelectedContactId("");
                    }}
                    className={cn("h-8 flex-1 rounded-md text-xs font-medium", !useExistingContact ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                  >
                    New number
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseExistingContact(true);
                      setNewPhone("");
                      setCountryCode(prefs.default_country_code);
                      setContactSearch("");
                    }}
                    className={cn("h-8 flex-1 rounded-md text-xs font-medium", useExistingContact ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                  >
                    Existing
                  </button>
                </div>

                {useExistingContact ? (
                  <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue
                        placeholder={
                          contactsLoading ? "Loading…" : contacts.length === 0 ? "No contacts" : "Choose a contact"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {contactsLoading ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading
                        </div>
                      ) : contacts.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Add contacts first.</div>
                      ) : (
                        <>
                          <div
                            className="sticky top-0 z-10 border-b bg-popover p-2"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDownCapture={(e) => e.stopPropagation()}
                          >
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={contactSearch}
                                onChange={(e) => setContactSearch(e.target.value)}
                                placeholder="Search contacts"
                                className="h-8 pl-8 text-xs"
                              />
                            </div>
                          </div>
                          {filteredContacts.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                          ) : (
                            filteredContacts.map((contact: Contact) => (
                              <SelectItem key={contact.id} value={String(contact.id)} className="text-xs">
                                <span className="font-medium">{contact.name || "Unknown"}</span>
                                <span className="ml-2 text-muted-foreground">{contact.phone}</span>
                              </SelectItem>
                            ))
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative w-16 shrink-0">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+</span>
                      <Input
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        placeholder={prefs.default_country_code}
                        className="h-9 pl-5 text-center"
                      />
                    </div>
                    <Input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="9876543210"
                      className="h-9"
                    />
                  </div>
                )}
              </div>
            ) : (
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue
                    placeholder={listsLoading ? "Loading…" : lists.length === 0 ? "No lists" : "Choose a list"}
                  />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {listsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading
                    </div>
                  ) : listsError ? (
                    <div className="px-3 py-2 text-xs text-destructive">Could not load lists</div>
                  ) : lists.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Create a list first.</div>
                  ) : (
                    lists.map((l: LeadList) => (
                      <SelectItem key={l.id} value={String(l.id)} className="text-xs">
                        {l.title}
                        <span className="ml-2 text-muted-foreground">{l.count || 0}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            <div className="space-y-1">
              <label className={fieldLabel}>Repeat</label>
              <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="every_n_days">Every N days</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="hourly">Every hour</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>
                {recurrenceType === "once" && "Date & time"}
                {recurrenceType === "daily" && "Time"}
                {recurrenceType === "every_n_days" && "Start & interval"}
                {recurrenceType === "weekly" && "Days & time"}
                {recurrenceType === "hourly" && "Minute"}
              </label>
              {recurrenceType === "once" && (
                <DateTimeField
                  value={newTime}
                  onChange={setNewTime}
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}
              {recurrenceType === "daily" && (
                <TimeField value={recurrenceTimeOnly} onChange={setRecurrenceTimeOnly} />
              )}
              {recurrenceType === "every_n_days" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Every</span>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="h-9 w-16 text-center"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                  <DateTimeField
                    value={newTime}
                    onChange={setNewTime}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
              {recurrenceType === "weekly" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfWeek(i)}
                        className={chipClass(daysOfWeek.includes(i))}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  {daysOfWeek.length > 0 ? (
                    <TimeField value={recurrenceTimeOnly} onChange={setRecurrenceTimeOnly} />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Select at least one day</p>
                  )}
                </div>
              )}
              {recurrenceType === "hourly" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">At minute</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={hourlyMinute}
                    onChange={(e) => setHourlyMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                    className="h-9 w-16 text-center"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={fieldLabel}>Message</label>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)} className="h-7 px-1.5 text-[11px]">
                    {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPreview ? "Edit" : "Preview"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowLibrary(true)} className="h-7 px-1.5 text-[11px]">
                    <Library className="h-3.5 w-3.5" />
                    Templates
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[11px]"
                    onClick={() => {
                      setMessageDraft(newMessage);
                      setMessageDraftPreview(false);
                      setMessageEditorOpen(true);
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Expand
                  </Button>
                </div>
              </div>
              {showPreview && newMessage ? (
                <div className="min-h-[120px] rounded-md border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {newMessage}
                </div>
              ) : (
                <>
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type the message…"
                    className="min-h-[120px] resize-y text-sm"
                  />
                  <p className="text-[11px] tabular-nums text-muted-foreground">{newMessage.length} characters</p>
                </>
              )}
            </div>

            {editingSchedule ? (
              <Button onClick={handleSaveEdit} disabled={editDisabled} className="h-9 w-full">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()} disabled={createDisabled} className="h-9 w-full">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                Schedule
              </Button>
            )}
          </div>
        </aside>

        <main className="chat-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", `All (${filteredSchedules.length})`],
                  ["single", `Single (${singleSchedules.length})`],
                  ["bulk", `Bulk (${batches.length})`],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setAnalysisView(key)} className={chipClass(analysisView === key)}>
                  {label}
                </button>
              ))}
              <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
              {["All", "Pending", "Sent", "Failed"].map((cat) => (
                <button key={cat} type="button" onClick={() => setStatusFilter(cat)} className={chipClass(statusFilter === cat)}>
                  {cat}
                  {cat !== "All" ? (
                    <span className="ml-1 tabular-nums opacity-70">
                      {cat === "Pending" ? stats.pending : cat === "Sent" ? stats.sent : stats.failed}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-[11rem]">
                <Layers className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchByListName}
                  onChange={(e) => setSearchByListName(e.target.value)}
                  placeholder="List name"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <DateField
                value={filterDate}
                onChange={setFilterDate}
                placeholder="Filter date"
                size="sm"
                allowClear
                className="w-40"
              />
              <p className="ml-auto text-[11px] text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">
                  {analysisView === "bulk" ? batches.length : listForView.length}
                </span>
                {analysisView === "bulk" ? " batches" : ` of ${stats.total}`}
              </p>
            </div>
          </div>

          {analysisView !== "bulk" && selectedCount > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium tabular-nums">{selectedCount} selected</span>
              {selectedPendingCount > 0 ? (
                <span className="text-[11px] text-muted-foreground">({selectedPendingCount} pending)</span>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {selectedPendingCount > 0 ? (
                  <Button size="sm" className="h-8" onClick={handleBulkSend} disabled={bulkSendMutation.isPending}>
                    {bulkSendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Send {selectedPendingCount}
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                >
                  {bulkDeleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete {selectedCount}
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedSchedules(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          {analysisView === "bulk" ? (
            batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
                <Layers className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No bulk batches</p>
              </div>
            ) : (
              <div className="space-y-2 pb-16">
                {batches.map(({ key, listTitle, content, time, schedules: batchSchedules }) => {
                  const expanded = expandedBatchKey === key;
                  const pending = batchSchedules.filter((s) => s.status === "PENDING").length;
                  const sent = batchSchedules.filter((s) => s.status === "SENT").length;
                  const failed = batchSchedules.filter((s) => s.status === "FAILED").length;
                  return (
                    <div key={key} className="card-soft p-3">
                      <button
                        type="button"
                        onClick={() => setExpandedBatchKey(expanded ? null : key)}
                        className="flex w-full items-start gap-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-sm font-medium">{listTitle || "Message batch"}</h3>
                            <StatusPill label={`${batchSchedules.length}`} tone="muted" />
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{content}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {time}
                            </span>
                            {pending > 0 ? <span>{pending} pending</span> : null}
                            {sent > 0 ? <span>{sent} sent</span> : null}
                            {failed > 0 ? <span>{failed} failed</span> : null}
                          </p>
                        </div>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {pending > 0 ? (
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              bulkSendMutation.mutate(batchSchedules.filter((s) => s.status === "PENDING").map((s) => s.id))
                            }
                            disabled={bulkSendMutation.isPending}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Send {pending}
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => setExpandedBatchKey(expanded ? null : key)}
                        >
                          {expanded ? "Hide" : "Show"} recipients
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8 text-destructive hover:text-destructive"
                          onClick={() => bulkDeleteMutation.mutate(batchSchedules.map((s) => s.id))}
                          disabled={bulkDeleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete batch
                        </Button>
                      </div>
                      {expanded ? (
                        <div className="mt-2 space-y-1.5 border-t pt-2">
                          {batchSchedules.map((msg) => (
                            <div key={msg.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{getContactName(msg.phone)}</p>
                                <p className="truncate text-[11px] text-muted-foreground">{msg.phone}</p>
                              </div>
                              <StatusPill label={msg.status} tone={statusTone(msg.status)} />
                              {msg.status === "PENDING" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => retryMutation.mutate(msg.id)}
                                  disabled={retryMutation.isPending}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => deleteMutation.mutate(msg.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-[11px] text-muted-foreground">Loading schedules</p>
            </div>
          ) : listForView.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
              <MessageSquare className="mb-1 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {analysisView === "single" ? "No single-contact schedules" : "No scheduled messages"}
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-16">
              <div className="flex items-center gap-2 px-1">
                <button type="button" onClick={toggleSelectAll} className="text-muted-foreground hover:text-primary">
                  {selectedSchedules.size === listForView.length && listForView.length > 0 ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </button>
                <span className="text-[11px] text-muted-foreground">Select all</span>
              </div>
              {listForView.map((msg) => {
                const isExpanded = expandedSchedule === msg.id;
                const isSelected = selectedSchedules.has(msg.id);
                const name = getContactName(msg.phone);
                const rec = recurrenceLabel(msg.recurrence_type);
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "card-soft p-3",
                      isSelected && "ring-1 ring-primary/30",
                      editingSchedule?.id === msg.id && "ring-1 ring-warning/40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleScheduleSelection(msg.id)}
                        className="mt-0.5 text-muted-foreground hover:text-primary"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-sm font-medium">{name}</h3>
                          <StatusPill label={msg.status} tone={statusTone(msg.status)} />
                          {rec ? <StatusPill label={rec} tone="info" /> : null}
                        </div>
                        {name !== msg.phone ? (
                          <p className="text-[11px] text-muted-foreground">{msg.phone}</p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setExpandedSchedule(isExpanded ? null : msg.id)}
                          className="mt-1 w-full text-left"
                        >
                          <p className={cn("text-[12px] leading-relaxed text-muted-foreground", !isExpanded && "line-clamp-2")}>
                            {msg.content}
                          </p>
                        </button>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {msg.time}
                          </span>
                          <span>{formatScheduleDate(msg.time)}</span>
                          {msg.list_title ? (
                            <span className="inline-flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {msg.list_title}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 pl-6">
                      {msg.status === "PENDING" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => retryMutation.mutate(msg.id)}
                          disabled={retryMutation.isPending}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Send now
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => copyToClipboard(msg.content)}>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      {msg.status === "PENDING" ? (
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => handleEdit(msg)}>
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(msg.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="flex max-h-[min(90dvh,100%)] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Library className="h-3.5 w-3.5" />
              </span>
              Templates
            </DialogTitle>
            <DialogDescription>Choose a saved message to insert.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                <Library className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No templates yet</p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleLoadTemplate(t)}
                  className="card-soft w-full p-3 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-sm font-medium">{t.title}</h4>
                    {t.category ? <StatusPill label={t.category} tone="muted" /> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{t.body}</p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={messageEditorOpen}
        onOpenChange={(open) => {
          setMessageEditorOpen(open);
          if (!open) setMessageDraftPreview(false);
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,100%)] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MessageSquare className="h-3.5 w-3.5" />
              </span>
              Message
            </DialogTitle>
            <DialogDescription>Write the scheduled message, then save it back to the form.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setMessageDraftPreview((p) => !p)}>
              {messageDraftPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {messageDraftPreview ? "Edit" : "Preview"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={!messageDraft}
              onClick={() => {
                if (messageDraft) copyToClipboard(messageDraft);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{messageDraft.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {messageDraftPreview ? (
              <div className="min-h-[160px] rounded-md border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap sm:min-h-[220px]">
                {messageDraft || "Nothing to preview"}
              </div>
            ) : (
              <Textarea
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                placeholder="Type the message…"
                className="min-h-[160px] resize-y text-sm sm:min-h-[220px]"
              />
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => {
                setMessageEditorOpen(false);
                setMessageDraftPreview(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9"
              disabled={!messageDraft.trim()}
              onClick={() => {
                setNewMessage(messageDraft);
                setShowPreview(false);
                setMessageEditorOpen(false);
                setMessageDraftPreview(false);
                toast.success("Message updated");
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
