import { useState, useMemo } from "react";
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle, Download, Users, Layers } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { read, utils, writeFile } from "xlsx";
import Papa from "papaparse";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { extractRawPhoneFromRow, normalizeContactPhone } from "@/lib/phone";
import { useAppPreferences } from "@/hooks/use-app-settings";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
  const queryClient = useQueryClient();
  const prefs = useAppPreferences();
  const cc = prefs.default_country_code;
  const [isParsing, setIsParsing] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("none");

  const { data: existingContacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen && previewData.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: api.lists.getAll,
    enabled: isOpen && previewData.length > 0,
  });

  const existingPhonesNorm = useMemo(
    () =>
      new Set(
        existingContacts
          .map((c) => normalizeContactPhone(c.phone, cc))
          .filter((p) => p.length > 0)
      ),
    [existingContacts, cc]
  );

  const newContacts = useMemo(
    () => previewData.filter((row) => row.phone && !existingPhonesNorm.has(row.phone)),
    [previewData, existingPhonesNorm]
  );

  const duplicateCount = useMemo(
    () => previewData.filter((row) => row.phone && existingPhonesNorm.has(row.phone)).length,
    [previewData, existingPhonesNorm]
  );

  const missingPhoneCount = useMemo(
    () => previewData.filter((row) => !row.phone).length,
    [previewData]
  );

  const skippedCount = previewData.length - newContacts.length;

  const detectedHeaders = useMemo(() => {
    if (previewData.length === 0) return "";
    const keys = Object.keys(previewData[0]).filter((k) => !String(k).startsWith("__"));
    return keys.length ? keys.slice(0, 14).join(", ") + (keys.length > 14 ? "…" : "") : "";
  }, [previewData]);

  const skipSummary = useMemo(() => {
    const parts: string[] = [];
    if (duplicateCount > 0) parts.push(`${duplicateCount} already in your contacts`);
    if (missingPhoneCount > 0) {
      parts.push(
        `${missingPhoneCount} row${missingPhoneCount !== 1 ? "s" : ""} with no readable phone`
      );
    }
    return parts.join(", ");
  }, [duplicateCount, missingPhoneCount]);

  const sanitizeBulkData = (data: any[]) => {
    return data.map(row => {
      const rawPhone = extractRawPhoneFromRow(row as Record<string, unknown>);
      const cleaned = normalizeContactPhone(rawPhone, cc);
      return {
        ...row,
        phone: cleaned,
        name: row.name || row.Name || "Unknown",
        stage: row.stage || row.Stage || "New",
        assigned_to: row.assigned_to || row.Operator || "Unassigned"
      };
    });
  };

  const bulkCreateMutation = useMutation({
    mutationFn: async (contactsToCreate: any[]) => {
      if (contactsToCreate.length === 0) return { created: 0 };
      await api.contacts.create(contactsToCreate);
      return { created: contactsToCreate.length };
    },
    onSuccess: async (_, contactsToCreate) => {
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      const createdCount = contactsToCreate.length;
      if (selectedListId && selectedListId !== "none" && createdCount > 0) {
        const allContacts = await queryClient.fetchQuery({ queryKey: ["contacts"], queryFn: api.contacts.getAll });
        const phonesToFind = new Set(
          contactsToCreate.map((c) => normalizeContactPhone(c.phone, cc)).filter((p) => p.length > 0)
        );
        const ids = allContacts
          .filter((c) => c.phone && phonesToFind.has(normalizeContactPhone(c.phone, cc)))
          .map((c) => c.id!)
          .filter(Boolean);
        if (ids.length > 0) {
          await api.lists.addLeads(selectedListId, ids);
          queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
        }
      }
      toast.success(
        createdCount > 0
          ? `${createdCount} contact(s) imported${selectedListId ? " and added to list" : ""}`
          : "No new contacts to import"
      );
      setPreviewData([]);
      setSelectedListId("none");
      onClose();
    },
    onError: () => toast.error("Import failed. Check file format (name, phone, stage, assigned_to)."),
  });

  const handleDownloadSample = () => {
    const headers = ["name", "phone", "stage", "assigned_to"];
    const sampleRows = [
      ["Vipin Tomar", "9876543210", "Hot", "Agent Alpha"],
      ["Intl lead", "+2347033302755", "New", "Unassigned"],
      ["Jayesh Thakur", "919000000000", "New", "Unassigned"],
    ];

    const ws = utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "CRM_Import_Template");
    writeFile(wb, "buildesk_bulk_template.xlsx");
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="pb-6 border-b border-border/50">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">Bulk import contacts</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Use + and country code in the file for international numbers; bare 10-digit rows default to India (91). Existing contacts are skipped.
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadSample}
              className="h-8 rounded-full text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary hover:bg-primary hover:text-white transition-all"
            >
              <Download className="w-3 h-3 mr-2" />
              Get Template
            </Button>
          </div>
        </DialogHeader>

        <div className="py-8 space-y-6">
          {previewData.length === 0 ? (
            <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-border rounded-[2rem] bg-secondary/5 hover:bg-secondary/10 cursor-pointer transition-all group">
              <div className="flex flex-col items-center justify-center">
                {isParsing ? <Loader2 className="w-10 h-10 text-primary animate-spin" /> : (
                  <>
                    <div className="p-4 bg-muted rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest">Select Source File</p>
                    <p className="text-[9px] text-muted-foreground mt-2 uppercase">CSV or XLSX supported</p>
                  </>
                )}
              </div>
              <input type="file" className="hidden" accept=".csv, .xlsx" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="p-4 rounded-2xl flex items-center justify-between border border-border bg-muted/20">
                <div className="flex items-center gap-3 flex-wrap">
                  <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      {newContacts.length} new contact{newContacts.length !== 1 ? "s" : ""} will be added
                      {skippedCount > 0 && skipSummary && (
                        <span className="text-muted-foreground font-normal"> · {skipSummary}</span>
                      )}
                    </p>
                    {newContacts.length === 0 && missingPhoneCount > 0 && (
                      <p className="text-amber-600 dark:text-amber-400 text-xs mt-0.5 leading-relaxed">
                        The sheet phone column may use a different header (for example Mobile, Lead phone, WhatsApp).
                        {detectedHeaders ? (
                          <>
                            {" "}
                            Columns we saw: <span className="font-mono text-foreground/90">{detectedHeaders}</span>
                          </>
                        ) : null}
                      </p>
                    )}
                    {newContacts.length === 0 && missingPhoneCount === 0 && duplicateCount > 0 && (
                      <p className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
                        Every number in this file is already in your contacts. Nothing to import.
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setPreviewData([]); setSelectedListId("none"); }}>Clear</Button>
              </div>

              {newContacts.length > 0 && (
                <>
                  <div className="border border-border rounded-xl overflow-hidden bg-muted/10">
                    <div className="max-h-48 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/30 sticky top-0">
                          <tr className="border-b border-border/50">
                            <th className="px-4 py-3 text-muted-foreground font-medium">Name</th>
                            <th className="px-4 py-3 text-muted-foreground font-medium">Phone</th>
                            <th className="px-4 py-3 text-muted-foreground font-medium">Stage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {newContacts.slice(0, 10).map((row, i) => (
                            <tr key={i} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-2.5 text-foreground">{row.name}</td>
                              <td className="px-4 py-2.5 font-mono text-primary">{row.phone}</td>
                              <td className="px-4 py-2.5">
                                <span className="px-2 py-0.5 rounded bg-muted text-xs">{row.stage}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {newContacts.length > 10 && (
                      <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border/50">+ {newContacts.length - 10} more</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Layers className="w-4 h-4 text-muted-foreground" /> Add to list (optional)
                    </label>
                    <Select value={selectedListId} onValueChange={setSelectedListId}>
                      <SelectTrigger className="w-full h-11 rounded-xl bg-muted/30 border-border">
                        <SelectValue placeholder="None — just import contacts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None — just import contacts</SelectItem>
                        {(lists as { id: number; title: string; count?: number }[]).map((list) => (
                          <SelectItem key={list.id} value={String(list.id)}>
                            {list.title} {list.count != null ? `(${list.count})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => bulkCreateMutation.mutate(newContacts)}
                    disabled={bulkCreateMutation.isPending}
                    className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl"
                  >
                    {bulkCreateMutation.isPending ? <Loader2 className="animate-spin" /> : `Import ${newContacts.length} new contact${newContacts.length !== 1 ? "s" : ""}`}
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="p-4 bg-muted/30 border border-border rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use columns: name, phone (or mobile / lead phone / WhatsApp), stage, assigned_to. Duplicates are detected after normalizing numbers (+ and country code). Existing contacts are not imported again.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}