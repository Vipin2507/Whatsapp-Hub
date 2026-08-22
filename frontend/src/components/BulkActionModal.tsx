import { useState } from "react";
import {
  CheckCircle2, UserCheck, Tag, Loader2,
  AlertCircle, Layers, Users
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "./ui/badge";

interface BulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: number[];
  selectedLeads: any[];
  onSuccess: () => void;
}

const LEAD_STAGES = ["New", "Follow-up", "Hot", "Cold", "Closed"];

export function BulkActionModal({ isOpen, onClose, selectedIds, selectedLeads, onSuccess }: BulkActionModalProps) {
  const queryClient = useQueryClient();
  const [newStage, setNewStage] = useState<string>("");
  const [newAgent, setNewAgent] = useState<string>("");
  const [targetListId, setTargetListId] = useState<string>("");


  // --- FETCH AVAILABLE LISTS ---
  const { data: lists = [] } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: api.lists.getAll,
    enabled: isOpen,
  });

  // --- MUTATION: METADATA UPDATE ---
  const bulkUpdateMutation = useMutation({
    mutationFn: (data: { stage?: string, assigned_to?: string }) =>
      api.contacts.bulkUpdate({ ids: selectedIds, ...data }),
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || error?.message || "Failed to update contacts";
      toast.error(errorMessage);
    },
  });

  // --- MUTATION: LIST ENROLLMENT ---
  const addToListMutation = useMutation({
    mutationFn: (listId: string) =>
      api.lists.addLeads(listId, selectedIds),
  });

  const handleExecute = async () => {
    if (!newStage && !newAgent && !targetListId) {
      return toast.error("Please select at least one operation to perform.");
    }

    try {
      // 1. Run Metadata Updates if needed
      if (newStage || newAgent) {
        const updateData: { stage?: string, assigned_to?: string } = {};
        if (newStage) updateData.stage = newStage;
        if (newAgent) updateData.assigned_to = newAgent;

        await bulkUpdateMutation.mutateAsync(updateData);
        toast.success(`Updated ${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''} successfully.`);
      }

      // 2. Run List Enrollment if needed
      if (targetListId) {
        await addToListMutation.mutateAsync(targetListId);
        toast.success(`Added ${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''} to list.`);
      }

      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["lead-lists"] });

      onSuccess();
      onClose();
      // Reset local states
      setNewStage("");
      setNewAgent("");
      setTargetListId("");
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || "Operation failed. Check system logs.";
      toast.error(errorMessage);
    }
  };

  return (
    <>
      <style>{`
        [data-radix-dialog-overlay] {
          z-index: 150 !important;
          position: fixed !important;
          inset: 0 !important;
          background-color: rgba(0, 0, 0, 0.8) !important;
        }
        [data-radix-dialog-content] {
          z-index: 151 !important;
          position: fixed !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
      `}</style>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        modal={true}
      >
        <DialogContent
          className="max-w-3xl overflow-hidden"
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
          }}
        >
          <DialogHeader className="pb-6 border-b border-border/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">Bulk update</DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm">
                  Update {selectedIds.length} contact{selectedIds.length !== 1 ? 's' : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-6 space-y-8">
            {/* SELECTED LEADS PREVIEW */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Users className="w-3 h-3 text-primary" /> Selected contacts
                </label>
              </div>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-3 bg-secondary/10 rounded-2xl border border-border/50 scrollbar-thin">
                {selectedLeads.map((lead) => (
                  <Badge key={lead.id} variant="secondary" className="bg-background border-border text-[9px] font-bold uppercase rounded-lg px-3 py-1">
                    {lead.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* TRIPLE ACTION GRID */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* 1. STAGE UPDATE */}
              <div className="space-y-3">
                <label className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-2 ml-1">
                  <Tag className="w-3 h-3 text-primary" /> Update Stage
                </label>
                <Select onValueChange={setNewStage} value={newStage}>
                  <SelectTrigger className="h-12 bg-secondary/50 rounded-2xl border-border focus:ring-1 ring-primary/30">
                    <SelectValue placeholder="New Stage" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {LEAD_STAGES.map(s => <SelectItem key={s} value={s} className="font-bold uppercase text-[10px]">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 2. AGENT ASSIGNMENT */}
              <div className="space-y-3">
                <label className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-2 ml-1">
                  <UserCheck className="w-3 h-3 text-primary" /> Assign Agent
                </label>
                <input
                  type="text"
                  placeholder="Agent Name"
                  value={newAgent}
                  onChange={(e) => setNewAgent(e.target.value)}
                  className="w-full h-12 bg-secondary/50 rounded-2xl border border-border px-4 text-sm focus:outline-none focus:ring-1 ring-primary/30 text-foreground"
                />
              </div>

              {/* 3. LIST ENROLLMENT */}
              <div className="space-y-3">
                <label className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-2 ml-1">
                  <Layers className="w-3 h-3 text-primary" /> Add to List
                </label>
                <Select onValueChange={setTargetListId} value={targetListId}>
                  <SelectTrigger className="h-12 bg-secondary/50 rounded-2xl border-border focus:ring-1 ring-primary/30">
                    <SelectValue placeholder="Select List" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {lists.map((l: any) => (
                      <SelectItem key={l.id} value={l.id.toString()} className="font-bold uppercase text-[10px]">
                        {l.title} ({l.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 bg-muted/30 border border-border rounded-xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Changes will apply to all selected contacts.
              </p>
            </div>
          </div>

          <DialogFooter className="bg-secondary/20 p-6 border-t border-border/50 flex gap-4">
            <Button variant="ghost" onClick={onClose} className="h-11 px-6 font-medium rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleExecute}
              disabled={bulkUpdateMutation.isPending || addToListMutation.isPending}
              className="h-11 flex-1 bg-primary text-primary-foreground font-semibold rounded-xl"
            >
              {(bulkUpdateMutation.isPending || addToListMutation.isPending) ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Apply changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
