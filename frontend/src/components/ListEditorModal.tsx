import { useState, useMemo } from "react";
import {
  Users, Search, Trash2, Loader2, X, UserMinus,
  ChevronLeft, UserPlus, ShieldCheck, Filter,
  ArrowRight, Database, Target, Upload, FileText,
  CheckCircle2, Download, AlertCircle, Tag, UserCheck, Calendar
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
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { extractRawPhoneFromRow, normalizeContactPhone } from "@/lib/phone";

interface ListEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetList: { id: number; title: string } | null;
}

const LEAD_STAGES = ["New", "Follow-up", "Hot", "Cold", "Closed"];

export function ListEditorModal({ isOpen, onClose, targetList }: ListEditorModalProps) {
  const queryClient = useQueryClient();
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

  // --- 1. DATA QUERIES ---
  // Fetch current members of this specific list
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["list-members", targetList?.id],
    queryFn: () => api.lists.getLeads(targetList!.id),
    enabled: !!targetList && isOpen,
  });

  // Fetch all leads from the global database to allow adding them
  const { data: allLeads = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
  });

  // --- 2. MUTATIONS ---
  const addLeadMutation = useMutation({
    mutationFn: (leadId: number) => api.lists.addLeads(targetList!.id.toString(), [leadId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success("Contact added to list");
    }
  });

  const bulkAddMutation = useMutation({
    mutationFn: (leadIds: number[]) => api.lists.addLeads(targetList!.id.toString(), leadIds),
    onSuccess: (_, leadIds) => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success(`${leadIds.length} contact${leadIds.length > 1 ? 's' : ''} added to list`);
      setSelectedContactIds(new Set());
    },
    onError: () => {
      toast.error("Failed to add contacts");
    }
  });

  const removeMutation = useMutation({
    mutationFn: (leadId: number) => api.lists.removeLead(targetList!.id, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-members", targetList?.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success("Contact removed from list");
    }
  });

  // Bulk import functionality
  const sanitizeBulkData = (data: any[]) => {
    return data.map(row => {
      const rawPhone = extractRawPhoneFromRow(row as Record<string, unknown>);
      const cleaned = normalizeContactPhone(rawPhone);
      return {
        ...row,
        phone: cleaned,
        name: row.name || row.Name || "Unknown Lead",
      };
    });
  };

  const bulkImportMutation = useMutation({
    mutationFn: async (leads: any[]) => {
      // First, create contacts that don't exist
      const contactsToCreate = leads.map(l => ({
        phone: l.phone,
        name: l.name,
        stage: l.stage || "New",
        assigned_to: l.assigned_to || "Unassigned"
      }));

      await api.contacts.create(contactsToCreate);

      // Refetch contacts to get the newly created ones with their IDs
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      const allContacts = await api.contacts.getAll();

      // Find matching contacts by phone and collect their IDs
      const leadIds: number[] = [];
      const phonesToFind = new Set(leads.map(l => l.phone));

      for (const contact of allContacts) {
        if (contact.phone && phonesToFind.has(contact.phone) && contact.id) {
          leadIds.push(contact.id);
        }
      }

      // Add all found leads to the list in one batch
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
    }
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
  };

  // --- 3. FILTERING LOGIC ---
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
    allLeads.forEach(c => {
      if (c.assigned_to && c.assigned_to !== "Unassigned") {
        assigned.add(c.assigned_to);
      }
    });
    return Array.from(assigned).sort();
  }, [allLeads]);

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) || m.phone.includes(memberSearch)
  );

  const availableLeads = allLeads.filter(l => {
    const isAlreadyMember = members.some(m => m.id === l.id);
    const matchesSearch = !globalSearch || l.name.toLowerCase().includes(globalSearch.toLowerCase()) || l.phone.includes(globalSearch);
    const matchesStage = stageFilter === "All" || (l.stage && l.stage === stageFilter) || (!l.stage && stageFilter === "New");
    const matchesAssigned = assignedToFilter === "All" || (assignedToFilter === "Unassigned" && (!l.assigned_to || l.assigned_to === "Unassigned")) || (l.assigned_to === assignedToFilter);
    const matchesDate = contactMatchesDateFilter(l);
    return !isAlreadyMember && matchesSearch && matchesStage && matchesAssigned && matchesDate;
  });

  const toggleContactSelection = (id: number) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllContacts = () => {
    if (selectedContactIds.size === availableLeads.length && availableLeads.length > 0) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(availableLeads.map(l => l.id!).filter((id): id is number => Boolean(id))));
    }
  };

  const handleBulkAdd = () => {
    if (selectedContactIds.size === 0) return;
    const ids = Array.from(selectedContactIds);
    bulkAddMutation.mutate(ids);
  };

  if (!isOpen || !targetList) return null;

  return (
    <div className="fixed top-0 right-0 bottom-0 left-[var(--app-sidebar-width,16rem)] z-[110] flex flex-col bg-background animate-in fade-in zoom-in-95 duration-300">

      {/* COMMAND HEADER */}
      <div className="h-24 border-b border-border bg-card/50 backdrop-blur-xl px-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            onClick={onClose}
            className="group flex items-center gap-3 text-muted-foreground hover:text-primary font-black uppercase text-xs tracking-widest"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Back to lists
          </Button>
          <div className="w-px h-8 bg-border" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Target className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tighter uppercase text-foreground">
                Edit list: <span className="text-primary">{targetList.title}</span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                  {members.length} contacts
                </span>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={onClose} variant="secondary" className="h-12 w-12 rounded-2xl">
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* DUAL PANE INTERFACE */}
      <div className="flex-1 flex overflow-hidden divide-x divide-border">

        {/* LEFT PANE: GLOBAL DATABASE (THE SOURCE) */}
        <div className="w-1/2 flex flex-col bg-secondary/5">
          <div className="p-8 border-b border-border bg-background/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Database className="w-4 h-4" /> All contacts
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkImport(!showBulkImport)}
                className="h-8 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary hover:bg-primary hover:text-white"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Bulk Import
              </Button>
            </div>

            {showBulkImport && (
              <div className="mb-6 p-4 bg-secondary/30 border border-border rounded-xl space-y-3">
                {previewData.length === 0 ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl bg-background/50 hover:bg-background cursor-pointer transition-all">
                    <div className="flex flex-col items-center justify-center">
                      {isParsing ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      ) : (
                        <>
                          <FileText className="w-6 h-6 text-muted-foreground mb-2" />
                          <p className="text-[9px] font-black uppercase tracking-widest">Select CSV/XLSX File</p>
                        </>
                      )}
                    </div>
                    <input type="file" className="hidden" accept=".csv, .xlsx" onChange={handleFileUpload} />
                  </label>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <p className="text-[9px] font-black uppercase">{previewData.length} records ready</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setPreviewData([]); setShowBulkImport(false); }}
                        className="h-6 text-[8px]"
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="max-h-32 overflow-y-auto border border-border rounded-lg">
                      <table className="w-full text-[8px] uppercase font-bold">
                        <thead className="bg-secondary/20 sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left">Name</th>
                            <th className="px-2 py-2 text-left">Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 3).map((row, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="px-2 py-1.5">{row.name}</td>
                              <td className="px-2 py-1.5 font-mono">{row.phone}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => bulkImportMutation.mutate(previewData)}
                        disabled={bulkImportMutation.isPending}
                        className="flex-1 h-8 text-[9px] font-black uppercase bg-primary hover:bg-primary/90"
                      >
                        {bulkImportMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          `Add ${previewData.length} contacts`
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadSample}
                        className="h-8 px-2 text-[9px] font-black uppercase"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[8px] font-bold text-amber-500/80 uppercase leading-relaxed">
                    Phone numbers will be created as contacts if they don't exist.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or phone..."
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  className="pl-12 h-10 bg-background border-border rounded-lg font-medium text-sm"
                />
              </div>

              {/* FILTERS */}
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-36 h-9 rounded-lg bg-secondary/30 border-border text-[10px] font-semibold">
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
                  <SelectTrigger className="w-40 h-9 rounded-lg bg-secondary/30 border-border text-[10px] font-semibold">
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
                  <SelectTrigger className="w-36 h-9 rounded-lg bg-secondary/30 border-border text-[10px] font-semibold">
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
                      className="h-9 w-32 text-[10px] rounded-lg bg-secondary/30 border-border"
                      placeholder="Start"
                    />
                    <span className="text-muted-foreground text-xs">to</span>
                    <Input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="h-9 w-32 text-[10px] rounded-lg bg-secondary/30 border-border"
                      placeholder="End"
                    />
                  </div>
                )}

                {(globalSearch || stageFilter !== "All" || assignedToFilter !== "All" || dateFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setGlobalSearch("");
                      setStageFilter("All");
                      setAssignedToFilter("All");
                      setDateFilter("all");
                      setRangeStart("");
                      setRangeEnd("");
                    }}
                    className="h-9 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Clear
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{availableLeads.length}</span> available contact{availableLeads.length !== 1 ? 's' : ''}
                </p>
                {selectedContactIds.size > 0 && (
                  <Button
                    onClick={handleBulkAdd}
                    disabled={bulkAddMutation.isPending}
                    className="h-8 px-4 rounded-lg bg-primary hover:bg-primary/90 text-white text-[10px] font-semibold transition-all"
                  >
                    {bulkAddMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                        Add {selectedContactIds.size} Selected
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* HEADERS */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center sticky top-0 z-10">
              <div className="col-span-1 flex justify-center">
                <button
                  onClick={toggleSelectAllContacts}
                  className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-all hover:opacity-80",
                    selectedContactIds.size === availableLeads.length && availableLeads.length > 0
                      ? "bg-blue-500 border-blue-500"
                      : "border-muted-foreground/50 hover:border-blue-500/50"
                  )}
                  title="Select all"
                >
                  {selectedContactIds.size === availableLeads.length && availableLeads.length > 0 && (
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  )}
                </button>
              </div>
              <div className="col-span-3 font-semibold">Name</div>
              <div className="col-span-2 text-center font-semibold">Phone</div>
              <div className="col-span-2 text-center font-semibold">Stage</div>
              <div className="col-span-2 text-center font-semibold">Assigned</div>
              <div className="col-span-2 text-right font-semibold">Action</div>
            </div>

            {/* LIST */}
            <div className="space-y-0">
              {availableLeads.map((lead) => {
                const isSelected = selectedContactIds.has(lead.id!);
                return (
                  <div key={lead.id} className={cn(
                    "grid grid-cols-12 gap-4 items-center px-4 py-2.5 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30",
                    isSelected && "bg-primary/5 border-l-2 border-l-primary"
                  )}>
                    <div className="col-span-1 flex justify-center">
                      <button
                        onClick={() => toggleContactSelection(lead.id!)}
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center transition-all hover:opacity-80",
                          isSelected
                            ? "bg-blue-500 border-blue-500"
                            : "border-muted-foreground/50 hover:border-blue-500/50"
                        )}
                        title="Select contact"
                      >
                        {isSelected && (
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        )}
                      </button>
                    </div>
                    <div className="col-span-3 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-semibold text-[10px] text-primary shrink-0">
                        {lead.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-foreground truncate">{lead.name}</span>
                    </div>
                    <div className="col-span-2 text-center font-mono text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={lead.phone}>
                      {lead.phone}
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Badge variant="outline" className="text-[9px] font-semibold px-2 py-0.5 rounded-md">
                        {lead.stage || "New"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-xs font-medium text-foreground">{lead.assigned_to || "Unassigned"}</span>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => addLeadMutation.mutate(lead.id!)}
                        disabled={addLeadMutation.isPending}
                        className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-white text-[10px] font-semibold transition-all"
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add
                      </Button>
                    </div>
                  </div>
                );
              })}
              {availableLeads.length === 0 && (
                <div className="text-center py-20 opacity-20 italic text-xs font-black uppercase tracking-widest">No contacts found</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: SEGMENT MEMBERS (THE ACTIVE MATRIX) */}
        <div className="w-1/2 flex flex-col bg-background">
          <div className="p-8 border-b border-border bg-card/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> In this list
              </h3>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter current members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-12 h-14 bg-secondary/20 border-border rounded-2xl font-bold"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* HEADERS */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center sticky top-0 z-10">
              <div className="col-span-4 font-semibold">Name</div>
              <div className="col-span-2 text-center font-semibold">Phone</div>
              <div className="col-span-2 text-center font-semibold">Stage</div>
              <div className="col-span-2 text-center font-semibold">Assigned</div>
              <div className="col-span-2 text-right font-semibold">Action</div>
            </div>

            {/* LIST */}
            <div className="space-y-0">
              {loadingMembers ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
              ) : filteredMembers.map((member) => (
                <div key={member.id} className="grid grid-cols-12 gap-4 items-center px-4 py-2.5 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30 bg-primary/5">
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[10px] shrink-0">
                      {member.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{member.name}</span>
                  </div>
                  <div className="col-span-2 text-center font-mono text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={member.phone}>
                    {member.phone}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Badge variant="outline" className="text-[9px] font-semibold px-2 py-0.5 rounded-md border-primary/20 text-primary">
                      {member.stage || "New"}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-xs font-medium text-foreground">{member.assigned_to || "Unassigned"}</span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(member.id!)}
                      className="h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredMembers.length === 0 && (
                <div className="text-center py-20 text-sm text-muted-foreground">No contacts in this list yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: hsl(var(--border)); 
          border-radius: 10px; 
        }
      `}</style>
    </div>
  );
}