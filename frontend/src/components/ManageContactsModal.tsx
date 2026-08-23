import { useState, useMemo } from "react";
import {
  Users,
  Search,
  Trash2,
  Loader2,
  X,
  Edit3,
  ChevronLeft,
  UserPlus,
  Database,
  Tag,
  UserCheck,
  Calendar,
  CheckSquare,
  Square,
  Save,
  Eraser,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Contact } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { normalizeContactPhone } from "@/lib/phone";
import { useAppPreferences } from "@/hooks/use-app-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkActionModal } from "./BulkActionModal";
import { StatusPill } from "@/components/PendingChip";
import { DateField } from "@/components/DateFields";

interface ManageContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
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

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export function ManageContactsModal({ isOpen, onClose }: ManageContactsModalProps) {
  const queryClient = useQueryClient();
  const prefs = useAppPreferences();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [assignedToFilter, setAssignedToFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkActionOpen, setIsBulkActionOpen] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStage, setNewStage] = useState("New");
  const [newAgent, setNewAgent] = useState("");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
  });

  const resetForge = () => {
    setEditingId(null);
    setNewName("");
    setNewPhone("");
    setNewStage("New");
    setNewAgent("");
  };

  const handleEditInitiate = (c: Contact) => {
    setEditingId(c.id!);
    setNewName(c.name || "");
    const contactStage = c.stage && LEAD_STAGES.includes(c.stage) ? c.stage : "New";
    setNewStage(contactStage);
    setNewAgent(c.assigned_to || "");
    setNewPhone(c.phone || "");
    setTimeout(() => {
      document.getElementById("registry-forge")?.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  const upsertMutation = useMutation({
    mutationFn: (data: Partial<Contact>) =>
      editingId ? api.contacts.update(editingId, data) : api.contacts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(editingId ? "Contact updated" : "Contact added");
      resetForge();
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error?.response?.data?.message || error?.message || "Operation failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.contacts.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact removed");
      setSelectedIds((prev) => prev.filter((i) => i !== deletedId));
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error?.response?.data?.message || "Failed to delete contact");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.contacts.delete(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      return { succeeded, failed, total: ids.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (result.failed > 0) {
        toast.warning(`Deleted ${result.succeeded} of ${result.total} contacts. ${result.failed} failed.`);
      } else {
        toast.success(`Deleted ${result.succeeded} contact${result.succeeded > 1 ? "s" : ""}`);
      }
      setSelectedIds([]);
    },
    onError: () => {
      toast.error("Bulk delete failed");
    },
  });

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

  const uniqueAssignedTo = useMemo(() => {
    const assigned = new Set<string>();
    contacts.forEach((c) => {
      if (c.assigned_to && c.assigned_to !== "Unassigned") assigned.add(c.assigned_to);
    });
    return Array.from(assigned).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        !search ||
        (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
        (c.phone && c.phone.includes(search));
      const matchesStage =
        stageFilter === "All" || (c.stage && c.stage === stageFilter) || (!c.stage && stageFilter === "New");
      const matchesAssigned =
        assignedToFilter === "All" ||
        (assignedToFilter === "Unassigned" && (!c.assigned_to || c.assigned_to === "Unassigned")) ||
        c.assigned_to === assignedToFilter;
      return matchesSearch && matchesStage && matchesAssigned && contactMatchesDateFilter(c);
    });
  }, [contacts, search, stageFilter, assignedToFilter, dateFilter, rangeStart, rangeEnd]);

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const handleSelectAll = () =>
    setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map((c) => c.id!).filter(Boolean));

  if (!isOpen) return null;

  return (
    <div className="app-overlay z-[120]">
      <header className="app-overlay-header">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 gap-1 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Contacts</h2>
            <p className="text-[11px] tabular-nums text-muted-foreground">{contacts.length} in registry</p>
          </div>
        </div>
        <div className="relative ml-auto w-32 min-w-0 sm:w-56 md:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="app-split">
        <aside id="registry-forge" className="chat-scroll app-split-side max-h-[46dvh] space-y-3 lg:max-h-none">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              {editingId ? "Edit contact" : "Add contact"}
            </h3>
            {(newName || newPhone || editingId) && (
              <Button variant="ghost" size="sm" onClick={resetForge} className="h-7 px-2 text-[11px] text-muted-foreground">
                <Eraser className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>

          <div className="card-soft space-y-3 p-4">
            {editingId ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning-foreground">
                Editing #{editingId}
              </p>
            ) : null}

            <div className="space-y-1">
              <label className={fieldLabel}>Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className="h-9" />
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>Phone</label>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder={`+${prefs.default_country_code}… or 10-digit local`}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className={fieldLabel}>Stage</label>
                <Select value={newStage} onValueChange={setNewStage}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {LEAD_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className={fieldLabel}>Assigned to</label>
                <Input
                  value={newAgent}
                  onChange={(e) => setNewAgent(e.target.value)}
                  placeholder="Agent or team"
                  className="h-9"
                />
              </div>
            </div>

            <Button
              onClick={() => {
                const phone = normalizeContactPhone(newPhone, prefs.default_country_code);
                if (!newName?.trim()) return toast.error("Name is required");
                if (!phone) return toast.error("Enter a valid phone number");
                upsertMutation.mutate({
                  name: newName.trim(),
                  phone,
                  stage: newStage,
                  assigned_to: newAgent || "Unassigned",
                });
              }}
              disabled={!newName || !newPhone || upsertMutation.isPending}
              className="h-9 w-full"
            >
              {upsertMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save changes
                </>
              ) : (
                "Save contact"
              )}
            </Button>
          </div>

          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Use a full international number with +country code, or a 10-digit India mobile (91 is added automatically).
          </p>
        </aside>

        <main className="chat-scroll min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-8 w-[132px] text-[11px]">
                <Tag className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Stage">{stageFilter === "All" ? "All stages" : stageFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="All">All stages</SelectItem>
                {LEAD_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
              <SelectTrigger className="h-8 w-[140px] text-[11px]">
                <UserCheck className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Assigned">{assignedToFilter === "All" ? "All agents" : assignedToFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="All">All agents</SelectItem>
                <SelectItem value="Unassigned">Unassigned</SelectItem>
                {uniqueAssignedTo.map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="h-8 w-[132px] text-[11px]">
                <Calendar className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Date">
                  {dateFilter === "all"
                    ? "All time"
                    : dateFilter === "today"
                      ? "Today"
                      : dateFilter === "7days"
                        ? "Last 7 days"
                        : dateFilter === "30days"
                          ? "Last 30 days"
                          : "Range"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="range">Custom range</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === "range" && (
              <div className="flex items-center gap-1.5">
                <DateField value={rangeStart} onChange={setRangeStart} placeholder="From" size="sm" allowClear className="w-36" />
                <span className="text-[11px] text-muted-foreground">to</span>
                <DateField value={rangeEnd} onChange={setRangeEnd} placeholder="To" size="sm" allowClear min={rangeStart} className="w-36" />
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
                className="h-8 text-[11px] text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}

            <p className="ml-auto text-[11px] text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{filtered.length}</span>
              {" of "}
              <span className="font-medium tabular-nums text-foreground">{contacts.length}</span>
            </p>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    if (selectedIds.length > 0) setIsBulkActionOpen(true);
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit {selectedIds.length}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${selectedIds.length} contact${selectedIds.length > 1 ? "s" : ""}?`)) {
                      bulkDeleteMutation.mutate(selectedIds);
                    }
                  }}
                >
                  {bulkDeleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete {selectedIds.length}
                </Button>
              </div>
            )}
          </div>

          <div className="table-scroll">
          <div className="card-soft min-w-[640px] overflow-hidden lg:min-w-0">
            <div className="grid grid-cols-12 items-center gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <div className="col-span-1 flex justify-center">
                <button type="button" onClick={handleSelectAll} className="text-muted-foreground hover:text-primary">
                  {selectedIds.length === filtered.length && filtered.length > 0 ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <div className="col-span-3">Name</div>
              <div className="col-span-2 text-center">Phone</div>
              <div className="col-span-2 text-center">Stage</div>
              <div className="col-span-2 text-center">Assigned</div>
              <div className="col-span-1 text-center">Date</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Loading contacts</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
                <Database className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No contacts found</p>
              </div>
            ) : (
              filtered.map((c) => {
                const activityDate = c.last_message_at || c.date;
                const dateDisplay = activityDate
                  ? new Date(activityDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "—";
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "grid grid-cols-12 items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-muted/30",
                      selectedIds.includes(c.id!) && "bg-primary/5",
                      editingId === c.id && "bg-warning/10",
                    )}
                  >
                    <div className="col-span-1 flex justify-center">
                      <button type="button" onClick={() => toggleSelect(c.id!)} className="text-muted-foreground hover:text-primary">
                        {selectedIds.includes(c.id!) ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="col-span-3 flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                        {(c.name || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate text-sm font-medium">{c.name}</span>
                    </div>
                    <div className="col-span-2 truncate text-center font-mono text-xs tabular-nums text-muted-foreground" title={c.phone}>
                      {c.phone}
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <StatusPill label={c.stage || "New"} tone={stageTone(c.stage)} />
                    </div>
                    <div className="col-span-2 truncate text-center text-xs">{c.assigned_to || "Unassigned"}</div>
                    <div className="col-span-1 text-center text-[11px] tabular-nums text-muted-foreground">{dateDisplay}</div>
                    <div className="col-span-1 flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        title="Edit contact"
                        onClick={() => handleEditInitiate(c)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Delete contact"
                        onClick={() => {
                          if (confirm(`Delete ${c.name}?`)) deleteMutation.mutate(c.id!);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>
        </main>
      </div>

      <BulkActionModal
        isOpen={isBulkActionOpen}
        onClose={() => setIsBulkActionOpen(false)}
        selectedIds={selectedIds}
        selectedLeads={contacts.filter((c) => selectedIds.includes(c.id!))}
        onSuccess={() => {
          setSelectedIds([]);
          queryClient.invalidateQueries({ queryKey: ["contacts"] });
        }}
      />
    </div>
  );
}
