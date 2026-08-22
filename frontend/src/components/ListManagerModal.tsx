import { useState } from "react";
import {
  Users, Plus, Send, Trash2, Edit3, Loader2,
  Layers, X, ChevronLeft, Search, Filter,
  ArrowRight, Target, Activity, CheckCircle2,
  Upload, FileText, CheckCircle, Download, AlertCircle
} from "lucide-react";
import { read, utils, writeFile } from "xlsx";
import Papa from "papaparse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { extractRawPhoneFromRow, normalizeContactPhone } from "@/lib/phone";
import { BroadcastModal } from "./BroadcastModal";
import { ListEditorModal } from "./ListEditorModal";

interface ListManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ListManagerModal({ isOpen, onClose }: ListManagerModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  // Creation State
  const [listTitle, setListTitle] = useState("");
  const [listDesc, setListDesc] = useState("");

  // MODAL STATES
  const [editingList, setEditingList] = useState<any | null>(null);
  const [broadcastTarget, setBroadcastTarget] = useState<any | null>(null);
  const [selectedLists, setSelectedLists] = useState<Set<number>>(new Set());
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  // --- FETCH LISTS ---
  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: api.lists.getAll,
    enabled: isOpen
  });

  // --- MUTATIONS ---
  const createListMutation = useMutation({
    mutationFn: (data: { title: string, description: string }) => api.lists.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      setListTitle("");
      setListDesc("");
      toast.success("List created");
    }
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: number) => api.lists.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      toast.success("List removed");
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(
        ids.map(id => api.lists.delete(id))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      return { success: ids.length - failed, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      setSelectedLists(new Set());
      if (result.failed === 0) {
        toast.success(`${result.success} list(s) deleted`);
      } else {
        toast.warning(`${result.success} deleted, ${result.failed} failed`);
      }
    },
    onError: () => toast.error("Bulk delete failed")
  });

  // Bulk import functionality for multiple lists
  const parseBulkLists = (data: any[]) => {
    // Expected format: list_title, list_description, lead_name, lead_phone, lead_stage, lead_assigned_to
    // Group by list_title to create multiple lists
    const listsMap = new Map<string, { title: string; description: string; leads: any[] }>();

    data.forEach(row => {
      const title = row.list_title || row.List_Title || row.LIST_TITLE || row.title || row.Title || "";
      const description = row.list_description || row.List_Description || row.LIST_DESCRIPTION || row.description || row.Description || "";
      const leadName = row.lead_name || row.Lead_Name || row.LEAD_NAME || row.name || row.Name || "Unknown Lead";
      const leadStage = row.lead_stage || row.Lead_Stage || row.LEAD_STAGE || row.stage || row.Stage || "New";
      const leadAssigned =
        row.lead_assigned_to || row.Lead_Assigned_To || row.LEAD_ASSIGNED_TO || row.assigned_to || row.Assigned_To || "Unassigned";

      if (!title) return; // Skip rows without list title

      const cleanedPhone = normalizeContactPhone(extractRawPhoneFromRow(row as Record<string, unknown>));

      if (!listsMap.has(title)) {
        listsMap.set(title, { title, description, leads: [] });
      }

      listsMap.get(title)!.leads.push({
        name: leadName,
        phone: cleanedPhone,
        stage: leadStage,
        assigned_to: leadAssigned
      });
    });

    return Array.from(listsMap.values());
  };

  const bulkImportMutation = useMutation({
    mutationFn: async (listsData: { title: string; description: string; leads: any[] }[]) => {
      let createdLists = 0;
      let totalLeadsImported = 0;

      for (const listData of listsData) {
        try {
          // Create the list
          const newList: any = await api.lists.create({
            title: listData.title,
            description: listData.description
          });

          // The API returns { status: "success", id: ... } or just the id
          const listId = newList?.id || (typeof newList === 'object' && 'id' in newList ? newList.id : null);

          if (listId) {
            createdLists++;

            // Create contacts if they don't exist
            await api.contacts.create(listData.leads);

            // Refetch contacts to get IDs
            await queryClient.invalidateQueries({ queryKey: ["contacts"] });
            const allContacts = await api.contacts.getAll();

            // Find matching contacts by phone
            const leadIds: number[] = [];
            const phonesToFind = new Set(listData.leads.map(l => l.phone));

            for (const contact of allContacts) {
              if (contact.phone && phonesToFind.has(contact.phone) && contact.id) {
                leadIds.push(contact.id);
              }
            }

            // Add leads to the list
            if (leadIds.length > 0) {
              await api.lists.addLeads(String(listId), leadIds);
              totalLeadsImported += leadIds.length;
            }
          }
        } catch (error) {
          console.error(`Error creating list ${listData.title}:`, error);
          // Continue with next list
        }
      }

      return { createdLists, totalLeadsImported };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`${result.createdLists} lists created with ${result.totalLeadsImported} total leads`);
      setPreviewData([]);
      setShowBulkImport(false);
    },
    onError: (error: any) => {
      console.error("Bulk import error:", error);
      toast.error(error.message || "Bulk import failed");
    }
  });

  const handleDownloadSample = () => {
    const headers = ["list_title", "list_description", "lead_name", "lead_phone", "lead_stage", "lead_assigned_to"];
    const sampleRows = [
      ["Q1 High Intent", "High priority leads for Q1", "John Doe", "9876543210", "Hot", "Agent Alpha"],
      ["Q1 High Intent", "High priority leads for Q1", "Jane Smith", "919000000000", "Warm", "Agent Beta"],
      ["Q2 Prospects", "Q2 campaign targets", "Bob Johnson", "9876543211", "New", "Unassigned"],
    ];
    const ws = utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Bulk_Lists_Template");
    writeFile(wb, "buildesk_bulk_lists_template.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const fileName = file.name.toLowerCase();

    const processResults = (data: any[]) => {
      const parsed = parseBulkLists(data);
      setPreviewData(parsed);
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

  const filteredLists = lists.filter((l: any) =>
    l.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Bulk selection helpers
  const toggleListSelection = (id: number) => {
    setSelectedLists(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLists.size === filteredLists.length) {
      setSelectedLists(new Set());
    } else {
      setSelectedLists(new Set(filteredLists.map((l: any) => l.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedLists.size === 0) return;
    if (window.confirm(`Delete ${selectedLists.size} list(s)? This cannot be undone.`)) {
      bulkDeleteMutation.mutate(Array.from(selectedLists));
    }
  };

  const selectedCount = selectedLists.size;

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 bottom-0 left-[var(--app-sidebar-width,16rem)] z-[100] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* 1. TOP COMMAND BAR */}
      <div className="h-24 border-b border-border bg-card/50 backdrop-blur-xl px-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            onClick={onClose}
            className="group flex items-center gap-3 text-muted-foreground hover:text-primary transition-all font-black uppercase text-xs tracking-widest"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Back
          </Button>
          <div className="w-px h-8 bg-border" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Layers className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Contact lists</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">{lists.length} lists</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search lists..."
              className="pl-12 h-12 bg-secondary/30 border-border rounded-2xl font-bold"
            />
          </div>
          <Button onClick={onClose} variant="secondary" className="h-12 w-12 rounded-2xl p-0">
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* 2. INITIALIZATION FORGE (SIDEBAR - 30%) */}
        <aside className="w-[30%] min-w-[380px] border-r border-border bg-secondary/5 p-10 overflow-y-auto space-y-10 custom-scrollbar">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> New list
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkImport(!showBulkImport)}
                className="h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest border-indigo-500/20 text-indigo-500 hover:bg-indigo-500 hover:text-white"
              >
                <Upload className="w-3 h-3 mr-1.5" />
                Bulk Import
              </Button>
            </div>

            {showBulkImport && (
              <div className="p-6 bg-card border border-border rounded-2xl space-y-4">
                {previewData.length === 0 ? (
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl bg-background/50 hover:bg-background cursor-pointer transition-all">
                    <div className="flex flex-col items-center justify-center">
                      {isParsing ? (
                        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                      ) : (
                        <>
                          <FileText className="w-6 h-6 text-muted-foreground mb-2" />
                          <p className="text-[9px] font-black uppercase tracking-widest">Select CSV/XLSX File</p>
                          <p className="text-[8px] text-muted-foreground mt-1">Import multiple lists with leads</p>
                        </>
                      )}
                    </div>
                    <input type="file" className="hidden" accept=".csv, .xlsx" onChange={handleFileUpload} />
                  </label>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <p className="text-[9px] font-black uppercase">
                          {previewData.length} list{previewData.length !== 1 ? 's' : ''} ready
                        </p>
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
                    <div className="max-h-48 overflow-y-auto border border-border rounded-lg">
                      <table className="w-full text-[8px] uppercase font-bold">
                        <thead className="bg-secondary/20 sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left">List Title</th>
                            <th className="px-2 py-2 text-left">Leads</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map((list, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="px-2 py-1.5 font-black">{list.title}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{list.leads.length} leads</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      onClick={() => bulkImportMutation.mutate(previewData)}
                      disabled={bulkImportMutation.isPending}
                      className="w-full h-8 text-[9px] font-black uppercase bg-indigo-500 hover:bg-indigo-600"
                    >
                      {bulkImportMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        `Create ${previewData.length} Lists`
                      )}
                    </Button>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSample}
                  className="w-full h-8 text-[9px] font-black uppercase tracking-widest border-indigo-500/20 text-indigo-500 hover:bg-indigo-500 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download Sample Excel Template
                </Button>
              </div>
            )}
            <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-xl shadow-black/5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">List name</label>
                <Input
                  value={listTitle}
                  onChange={e => setListTitle(e.target.value)}
                  placeholder="e.g., Q1 High Intent Leads"
                  className="h-12 bg-background rounded-xl font-bold text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Description</label>
                <Input
                  value={listDesc}
                  onChange={e => setListDesc(e.target.value)}
                  placeholder="Internal description..."
                  className="h-12 bg-background rounded-xl text-xs"
                />
              </div>
              <Button
                onClick={() => createListMutation.mutate({ title: listTitle, description: listDesc })}
                disabled={!listTitle || createListMutation.isPending}
                className="w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
              >
                {createListMutation.isPending ? <Loader2 className="animate-spin" /> : "Create list"}
              </Button>
            </div>
          </div>

          <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-3xl">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-4 h-4 text-indigo-500" />
              <h4 className="text-sm font-medium text-foreground">Tip</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              Create lists to group contacts and send bulk messages or schedule campaigns.
            </p>
          </div>
        </aside>

        {/* 3. SEGMENT DIRECTORY (LIST VIEW - 70%) */}
        <main className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-background">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Your lists</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Showing <span className="font-semibold text-foreground">{filteredLists.length}</span> of <span className="font-semibold text-foreground">{lists.length}</span> list{lists.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* BULK ACTIONS */}
            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  className="h-9 px-4 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive dark:text-rose-400 border-destructive/20 text-[10px] font-semibold"
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
                  onClick={() => setSelectedLists(new Set())}
                  className="h-9 px-3 rounded-lg text-[10px] font-semibold"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* LIST VIEW HEADERS - compact grid */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center">
            <div className="col-span-1 flex justify-center">
              <button
                onClick={toggleSelectAll}
                className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center transition-all hover:opacity-80",
                  selectedLists.size === filteredLists.length && filteredLists.length > 0
                    ? "bg-blue-500 border-blue-500"
                    : "border-muted-foreground/50 hover:border-blue-500/50"
                )}
                title="Select all"
              >
                {selectedLists.size === filteredLists.length && filteredLists.length > 0 && (
                  <CheckCircle2 className="w-3 h-3 text-white" />
                )}
              </button>
            </div>
            <div className="col-span-4 font-semibold">List Name</div>
            <div className="col-span-2 text-center font-semibold">Contacts</div>
            <div className="col-span-5 text-right font-semibold">Actions</div>
          </div>

          <div className="space-y-0 pb-20">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center opacity-30">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="mt-4 text-sm text-muted-foreground">Loading lists...</p>
              </div>
            ) : filteredLists.map((list: any) => {
              const isSelected = selectedLists.has(list.id);
              return (
                <div
                  key={list.id}
                  className={cn(
                    "grid grid-cols-12 gap-4 items-center px-4 py-2.5 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30",
                    isSelected && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  {/* CHECKBOX */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => toggleListSelection(list.id)}
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center transition-all hover:opacity-80",
                        isSelected
                          ? "bg-blue-500 border-blue-500"
                          : "border-muted-foreground/50 hover:border-blue-500/50"
                      )}
                      title="Select list"
                    >
                      {isSelected && (
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      )}
                    </button>
                  </div>

                  {/* IDENTITY */}
                  <div className="col-span-4 flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-foreground truncate">{list.title}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {list.description || "No description"}
                    </span>
                  </div>

                  {/* COUNT */}
                  <div className="col-span-2 flex justify-center">
                    <Badge variant="outline" className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/5 text-indigo-500 border-indigo-500/20">
                      {list.count || 0} contacts
                    </Badge>
                  </div>

                  {/* ACTIONS */}
                  <div className="col-span-5 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingList(list)}
                      className="h-8 px-3 rounded-md hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors text-[10px] font-semibold"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button
                      onClick={() => setBroadcastTarget(list)}
                      className="h-8 px-3 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-semibold transition-all"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" /> Broadcast
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { if (window.confirm("Delete this list?")) deleteListMutation.mutate(list.id) }}
                      className="h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {!isLoading && filteredLists.length === 0 && (
              <div className="py-20 text-center opacity-20">
                <Users className="w-16 h-16 mx-auto mb-6" />
                <p className="font-black uppercase text-sm tracking-[0.3em]">No lists found</p>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: hsl(var(--border)); 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }
      `}</style>

      {/* SUB-MODALS */}
      {editingList && (
        <ListEditorModal
          isOpen={!!editingList}
          onClose={() => setEditingList(null)}
          targetList={editingList}
        />
      )}

      {broadcastTarget && (
        <BroadcastModal
          isOpen={!!broadcastTarget}
          onClose={() => setBroadcastTarget(null)}
          targetList={broadcastTarget}
        />
      )}
    </div>
  );
}