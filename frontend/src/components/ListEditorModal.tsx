import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Loader2,
  X,
  UserMinus,
  ChevronLeft,
  UserPlus,
  Users,
  Database,
  Upload,
  FileText,
  Download,
  AlertCircle,
  Tag,
  UserCheck,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { read, utils, writeFile } from "xlsx";
import Papa from "papaparse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Contact } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { extractRawPhoneFromRow, normalizeContactPhone } from "@/lib/phone";
import { useAppPreferences } from "@/hooks/use-app-settings";
import { DateField } from "@/components/DateFields";
import { StatusPill } from "@/components/PendingChip";
import { SelectCheck } from "@/components/SelectCheck";

interface ListEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetList: { id: number; title: string } | null;
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

export function ListEditorModal({ isOpen, onClose, targetList }: ListEditorModalProps) {
  const queryClient = useQueryClient();
  const prefs = useAppPreferences();
  const [memberSearch, setMemberSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [assignedToFilter, setAssignedToFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["list-members", targetList?.id],
    queryFn: () => api.lists.getLeads(targetList!.id),
    enabled: !!targetList && isOpen,
  });

  const { data: allLeads = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
  });

  useEffect(() => {
    setMemberSearch("");
    setGlobalSearch("");
    setStageFilter("All");
    setAssignedToFilter("All");
    setDateFilter("all");
    setRangeStart("");
    setRangeEnd("");
    setShowBulkImport(false);
    setPreviewData([]);
    setSelectedContactIds(new Set());
  }, [targetList?.id]);

  const addLeadMutation = useMutation({
    mutationFn: (leadId: number) => api.lists.addLeads(targetList!.id.toString(), [leadId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success("Contact added to list");
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: (leadIds: number[]) => api.lists.addLeads(targetList!.id.toString(), leadIds),
    onSuccess: (_, leadIds) => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success(`${leadIds.length} contact${leadIds.length > 1 ? "s" : ""} added to list`);
      setSelectedContactIds(new Set());
    },
    onError: () => {
      toast.error("Failed to add contacts");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (leadId: number) => api.lists.removeLead(targetList!.id, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success("Contact removed from list");
    },
  });

  const sanitizeBulkData = (data: any[]) => {
    return data.map((row) => {
      const rawPhone = extractRawPhoneFromRow(row as Record<string, unknown>);
      const cleaned = normalizeContactPhone(rawPhone, prefs.default_country_code);
      return {
        ...row,
        phone: cleaned,
        name: row.name || row.Name || "Unknown Lead",
      };
    });
  };

  const bulkImportMutation = useMutation({
    mutationFn: async (leads: any[]) => {
      const contactsToCreate = leads.map((l) => ({
        phone: l.phone,
        name: l.name,
        stage: l.stage || "New",
        assigned_to: l.assigned_to || "Unassigned",
      }));

      await api.contacts.create(contactsToCreate);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      const allContacts = await api.contacts.getAll();

      const leadIds: number[] = [];
      const phonesToFind = new Set(leads.map((l) => l.phone));

      for (const contact of allContacts) {
        if (contact.phone && phonesToFind.has(contact.phone) && contact.id) {
          leadIds.push(contact.id);
        }
      }

      if (leadIds.length > 0) {
        await api.lists.addLeads(targetList!.id.toString(), leadIds);
      }

      return { imported: leadIds.length, total: leads.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`${result.imported} contact(s) added to list`);
      setPreviewData([]);
      setShowBulkImport(false);
    },
    onError: (error: any) => {
      console.error("Bulk import error:", error);
      toast.error(error.message || "Bulk import failed");
    },
  });

  const handleDownloadSample = () => {
    const headers = ["name", "phone", "stage", "assigned_to"];
    const sampleRows = [
      ["John Doe", "9876543210", "Hot", "Agent Alpha"],
      ["Jane Smith", "+447911123456", "New", "Unassigned"],
    ];
    const ws = utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "List_Import_Template");
    writeFile(wb, `buildesk_list_${targetList?.title}_template.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const fileName = file.name.toLowerCase();

    const processResults = (data: any[]) => {
      const sanitized = sanitizeBulkData(data);
      setPreviewData(sanitized);
      setIsParsing(false);
    };

    if (fileName.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processResults(results.data),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = utils.sheet_to_json(ws);
        processResults(data);
      };
      reader.readAsBinaryString(file);
    }
    e.target.value = "";
  };

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
    allLeads.forEach((c) => {
      if (c.assigned_to && c.assigned_to !== "Unassigned") assigned.add(c.assigned_to);
    });
    return Array.from(assigned).sort();
  }, [allLeads]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.phone.includes(memberSearch));
  }, [members, memberSearch]);

  const availableLeads = useMemo(() => {
    return allLeads.filter((l) => {
      const isAlreadyMember = memberIds.has(l.id);
      const matchesSearch =
        !globalSearch ||
        l.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
        l.phone.includes(globalSearch);
      const matchesStage =
        stageFilter === "All" || (l.stage && l.stage === stageFilter) || (!l.stage && stageFilter === "New");
      const matchesAssigned =
        assignedToFilter === "All" ||
        (assignedToFilter === "Unassigned" && (!l.assigned_to || l.assigned_to === "Unassigned")) ||
        l.assigned_to === assignedToFilter;
      return !isAlreadyMember && matchesSearch && matchesStage && matchesAssigned && contactMatchesDateFilter(l);
    });
  }, [allLeads, memberIds, globalSearch, stageFilter, assignedToFilter, dateFilter, rangeStart, rangeEnd]);

  useEffect(() => {
    setSelectedContactIds((prev) => {
      const next = new Set([...prev].filter((id) => !memberIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [memberIds]);

  const filtersActive =
    !!globalSearch || stageFilter !== "All" || assignedToFilter !== "All" || dateFilter !== "all";

  const toggleContactSelection = (id: number) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllContacts = () => {
    if (selectedContactIds.size === availableLeads.length && availableLeads.length > 0) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(availableLeads.map((l) => l.id!).filter((id): id is number => Boolean(id))));
    }
  };

  const handleBulkAdd = () => {
    if (selectedContactIds.size === 0) return;
    bulkAddMutation.mutate(Array.from(selectedContactIds));
  };

  const allSelected = selectedContactIds.size === availableLeads.length && availableLeads.length > 0;

  if (!isOpen || !targetList) return null;

  return (
    <div className="app-overlay z-[110]">
      <header className="app-overlay-header">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 gap-1 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              Edit list
              <span className="text-muted-foreground"> · </span>
              <span className="text-primary">{targetList.title}</span>
            </h2>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="ml-auto h-8 w-8 text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="app-split">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="shrink-0 space-y-3 border-b p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                <Database className="h-3.5 w-3.5 text-primary" />
                Add contacts
              </h3>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">{availableLeads.length}</span>
                {" available"}
              </p>
              <div className="ml-auto flex items-center gap-1.5">
                {selectedContactIds.size > 0 ? (
                  <>
                    <Button size="sm" className="h-8" onClick={handleBulkAdd} disabled={bulkAddMutation.isPending}>
                      {bulkAddMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      Add {selectedContactIds.size}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => setSelectedContactIds(new Set())}>
                      Clear
                    </Button>
                  </>
                ) : null}
                <Button
                  variant={showBulkImport ? "secondary" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => setShowBulkImport((v) => !v)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </Button>
              </div>
            </div>

            {showBulkImport ? (
              <div className="card-soft space-y-3 p-3">
                {previewData.length === 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex min-h-[4.5rem] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-center hover:bg-muted/50">
                      {isParsing ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <>
                          <FileText className="mb-1 h-4 w-4 text-muted-foreground" />
                          <p className="text-xs font-medium">Drop a CSV or XLSX file</p>
                          <p className="text-[11px] text-muted-foreground">name, phone, stage, assigned_to</p>
                        </>
                      )}
                      <input type="file" className="hidden" accept=".csv,.xlsx" onChange={handleFileUpload} />
                    </label>
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleDownloadSample}>
                      <Download className="h-3.5 w-3.5" />
                      Template
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {previewData.length} records ready
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          setPreviewData([]);
                          setShowBulkImport(false);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="max-h-28 overflow-y-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/60 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Name</th>
                            <th className="px-2 py-1.5 text-left">Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 8).map((row, i) => (
                            <tr key={i} className="border-t border-border/60">
                              <td className="px-2 py-1.5">{row.name}</td>
                              <td className="px-2 py-1.5 font-mono tabular-nums text-muted-foreground">{row.phone}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewData.length > 8 ? (
                        <p className="border-t px-2 py-1 text-[11px] text-muted-foreground">
                          +{previewData.length - 8} more
                        </p>
                      ) : null}
                    </div>
                    <Button
                      className="h-8 w-full"
                      onClick={() => bulkImportMutation.mutate(previewData)}
                      disabled={bulkImportMutation.isPending}
                    >
                      {bulkImportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Add {previewData.length} contacts
                    </Button>
                  </div>
                )}
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                  New phone numbers are created as contacts, then added to this list.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name or number"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  className="h-8 pl-8"
                />
              </div>

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
                  <SelectValue placeholder="Assigned">
                    {assignedToFilter === "All" ? "All agents" : assignedToFilter}
                  </SelectValue>
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

              {dateFilter === "range" ? (
                <div className="flex items-center gap-1.5">
                  <DateField value={rangeStart} onChange={setRangeStart} placeholder="From" size="sm" allowClear className="w-36" />
                  <span className="text-[11px] text-muted-foreground">to</span>
                  <DateField value={rangeEnd} onChange={setRangeEnd} placeholder="To" size="sm" allowClear min={rangeStart} className="w-36" />
                </div>
              ) : null}

              {filtersActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px] text-muted-foreground"
                  onClick={() => {
                    setGlobalSearch("");
                    setStageFilter("All");
                    setAssignedToFilter("All");
                    setDateFilter("all");
                    setRangeStart("");
                    setRangeEnd("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="table-scroll">
              <div className="card-soft min-w-[560px] overflow-hidden lg:min-w-0">
                <div className="grid grid-cols-12 items-center gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="col-span-1 flex justify-center">
                    <SelectCheck
                      checked={allSelected}
                      indeterminate={selectedContactIds.size > 0 && !allSelected}
                      onClick={toggleSelectAllContacts}
                      label="Select all contacts"
                    />
                  </div>
                  <div className="col-span-3">Name</div>
                  <div className="col-span-3 text-center">Phone</div>
                  <div className="col-span-2 text-center">Stage</div>
                  <div className="col-span-2 text-center">Assigned</div>
                  <div className="col-span-1 text-right">Add</div>
                </div>

                {availableLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
                    <Database className="mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {allLeads.length === 0
                        ? "No contacts in the registry yet"
                        : filtersActive
                          ? "No contacts match these filters"
                          : "Every contact is already in this list"}
                    </p>
                  </div>
                ) : (
                  availableLeads.map((lead) => {
                    const isSelected = selectedContactIds.has(lead.id!);
                    return (
                      <div
                        key={lead.id}
                        className={cn(
                          "grid grid-cols-12 items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-muted/30",
                          isSelected && "bg-primary/5",
                        )}
                      >
                        <div className="col-span-1 flex justify-center">
                          <SelectCheck
                            checked={isSelected}
                            onClick={() => toggleContactSelection(lead.id!)}
                            label={`Select ${lead.name}`}
                          />
                        </div>
                        <div className="col-span-3 flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                            {(lead.name || "?").slice(0, 2).toUpperCase()}
                          </span>
                          <span className="truncate text-sm font-medium">{lead.name}</span>
                        </div>
                        <div className="col-span-3 truncate text-center font-mono text-xs tabular-nums text-muted-foreground" title={lead.phone}>
                          {lead.phone}
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <StatusPill label={lead.stage || "New"} tone={stageTone(lead.stage)} />
                        </div>
                        <div className="col-span-2 truncate text-center text-xs">{lead.assigned_to || "Unassigned"}</div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => addLeadMutation.mutate(lead.id!)}
                            disabled={addLeadMutation.isPending}
                            title="Add to list"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="flex max-h-[42dvh] min-h-0 w-full shrink-0 flex-col border-t bg-card lg:max-h-none lg:w-[min(100%,22rem)] lg:border-l lg:border-t-0">
          <div className="shrink-0 space-y-2 border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight">In this list</h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">{filteredMembers.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter members"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="h-8 pl-8"
              />
            </div>
          </div>

          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
            {loadingMembers ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Loading members</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
                <Users className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {members.length === 0 ? "No contacts in this list yet" : "No members match that search"}
                </p>
              </div>
            ) : (
              filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="group flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-muted/30"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">
                    {(member.name || "?").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">{member.phone}</p>
                      <StatusPill label={member.stage || "New"} tone={stageTone(member.stage)} className="shrink-0 text-[10px]" />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remove from list"
                    onClick={() => removeMutation.mutate(member.id!)}
                    disabled={removeMutation.isPending}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
