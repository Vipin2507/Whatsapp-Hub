import { useState, useEffect } from "react";
import {
  X, Sparkles, Search, Edit3, Trash2, Loader2,
  Zap, Plus, Check, Tag, HeartHandshake,
  RefreshCw, ChevronLeft, Library, Copy, Eraser, Save
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Template } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
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

interface TemplateLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (body: string) => void;
}

export function TemplateLabModal({ isOpen, onClose, onSelectTemplate }: TemplateLabModalProps) {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // UI & Filter State
  const [aiPrompt, setAiPrompt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Manual Construction / Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("sales");
  const [newBody, setNewBody] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.getAll,
    enabled: isOpen,
  });

  // --- HELPER ACTIONS ---
  const resetForm = () => {
    setEditingId(null);
    setNewTitle("");
    setNewCategory("sales");
    setNewBody("");
    setIsCreateDialogOpen(false);
  };

  const handleCopy = async (id: number, text: string) => {
    try {
      // 1. Try modern API (works on localhost or HTTPS)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success("Payload Captured: Copied to Clipboard");
      } else {
        // 2. Tactical Fallback (works on HTTP / Public IP)
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but exists in the DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          setCopiedId(id);
          toast.success("Payload Captured (Fallback Mode)");
        } else {
          throw new Error("ExecCommand failed");
        }
      }

      // Reset the "Checkmark" icon after 2 seconds
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Copy Error:", err);
      toast.error("Copy Failed: Browser security blocked the action");
    }
  };

  const handleDeploy = (body: string) => {
    if (onSelectTemplate) {
      onSelectTemplate(body);
      onClose();
      toast.success("Template added to message");
    }
  };

  const handleEditInitiate = (template: Template) => {
    setEditingId(template.id);
    setNewTitle(template.title);
    setNewCategory(template.category);
    setNewBody(template.body);
  };

  // --- MUTATIONS ---
  const createMutation = useMutation({
    mutationFn: api.templates.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      resetForm();
      toast.success("Vault Updated: Manual Template Authorized");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: Partial<Template> }) =>
      api.templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      resetForm();
      toast.success("Template saved");
    }
  });

  const aiMutation = useMutation({
    mutationFn: (prompt: string) => api.templates.aiGenerate(prompt),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setAiPrompt("");
      toast.success("AI Synthesis Complete: Template Forged");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template removed");
    }
  });

  const handleSubmit = () => {
    if (!newTitle || !newBody) {
      toast.error("Title and body are required");
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: { title: newTitle, body: newBody, category: newCategory }
      });
    } else {
      createMutation.mutate({ title: newTitle, body: newBody, category: newCategory });
    }
  };

  const handleCreateClick = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const getCategoryIcon = (category: string) => {
    const iconClass = "w-3 h-3";
    switch (category.toLowerCase()) {
      case "sales": return <Tag className={iconClass} />;
      case "support": return <HeartHandshake className={iconClass} />;
      case "followup": return <RefreshCw className={iconClass} />;
      default: return <Plus className={iconClass} />;
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (!isOpen) return null;

  return (
    <div className="app-overlay z-[100]">

      {/* 1. TOP COMMAND BAR */}
      <div className="app-overlay-header">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="group flex items-center gap-3 text-muted-foreground hover:text-primary transition-all font-semibold uppercase text-xs tracking-wider"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">Return to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
            <div className="hidden h-8 w-px bg-border/50 sm:block" />
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground sm:flex">
              <Library className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="truncate text-sm font-semibold tracking-tight sm:text-lg">Template Lab</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Vault Secure</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none lg:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search specific payloads..."
              className="h-9 pl-10 text-sm"
            />
          </div>
          <Button onClick={onClose} variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      <div className="app-split">

        {/* 2. THE FORGE (SIDEBAR - 30%) */}
        <aside id="forge-sidebar" className="app-split-side custom-scrollbar max-h-[46dvh] space-y-6 lg:max-h-none">

          {/* AI Generator Unit */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Logic Synthesis
            </h3>
            <div className="p-6 bg-gradient-to-br from-card/80 to-card/60 border border-border/50 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300">
              <Textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Describe what you want to say..."
                className="min-h-[120px] bg-gradient-to-br from-background to-secondary/20 border-border/50 rounded-2xl p-4 text-xs resize-none mb-4 font-medium shadow-sm focus:shadow-md transition-all"
              />
              <Button
                onClick={() => aiMutation.mutate(aiPrompt)}
                disabled={aiMutation.isPending || !aiPrompt.trim()}
                className="w-full h-14 rounded-2xl font-semibold uppercase text-[10px] tracking-wider bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/30 transition-all duration-200 active:scale-95 hover:shadow-xl hover:shadow-primary/40"
              >
                {aiMutation.isPending ? <Loader2 className="animate-spin" /> : "Synthesize with AI"}
              </Button>
            </div>
          </div>

          {/* Quick Create Button */}
          <div className="pt-4 border-t border-border/50">
            <Button
              onClick={handleCreateClick}
              disabled={!!editingId}
              className="w-full h-14 rounded-xl font-semibold uppercase text-[10px] tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30 transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Template
            </Button>
            {editingId && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold text-center">
                  Close the edit dialog to create a new template.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* 3. THE LIBRARY (LIST VIEW - 70%) */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background p-3 sm:p-6 custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Template Library</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Showing <span className="font-semibold text-foreground">{filteredTemplates.length}</span> of <span className="font-semibold text-foreground">{templates.length}</span> templates
              </p>
            </div>

            <div className="flex gap-2 bg-secondary/30 p-1 rounded-lg border border-border">
              {["All", "sales", "support", "followup"].map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "ghost"}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "h-8 px-4 rounded-md text-[10px] font-semibold transition-all",
                    selectedCategory === cat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {/* COMPACT GRID HEADERS */}
          <div className="table-scroll">
          <div className="min-w-[640px] lg:min-w-0">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center">
            <div className="col-span-3 font-semibold">Title</div>
            <div className="col-span-2 text-center font-semibold">Category</div>
            <div className="col-span-5 font-semibold">Message</div>
            <div className="col-span-2 text-right font-semibold">Actions</div>
          </div>

          <div className="space-y-0 pb-20">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center opacity-30">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">Loading templates...</p>
              </div>
            ) : filteredTemplates.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "grid grid-cols-12 gap-4 items-center px-4 py-2.5 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30",
                  editingId === t.id && "bg-amber-500/10 border-l-2 border-l-amber-500"
                )}
              >
                {/* TITLE */}
                <div className="col-span-3 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">{t.title}</span>
                </div>

                {/* CATEGORY */}
                <div className="col-span-2 flex justify-center">
                  <Badge variant="outline" className="text-[9px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                    {getCategoryIcon(t.category)} {t.category}
                  </Badge>
                </div>

                {/* MESSAGE PREVIEW */}
                <div className="col-span-5 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {t.body}
                  </p>
                </div>

                {/* ACTIONS */}
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(t.id, t.body)}
                    className="h-8 w-8 rounded-md hover:bg-primary/10 hover:text-primary transition-all shrink-0"
                    title="Copy"
                  >
                    {copiedId === t.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditInitiate(t)}
                    className="h-8 w-8 rounded-md hover:bg-amber-500/10 hover:text-amber-500 transition-all shrink-0"
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeploy(t.body)}
                    className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-white text-[10px] font-semibold transition-all"
                  >
                    Use
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate(t.id) }}
                    className="h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {!isLoading && filteredTemplates.length === 0 && (
              <div className="py-20 text-center opacity-20">
                <Library className="w-16 h-16 mx-auto mb-6" />
                <p className="text-sm text-muted-foreground">No templates found</p>
              </div>
            )}
          </div>
          </div>
          </div>
        </main>
      </div>

      {/* CREATE TEMPLATE DIALOG */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Plus className="w-5 h-5 text-primary" />
              Create New Template
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Create a new message template for your campaigns.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto custom-scrollbar mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Title</label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Template title"
                className="h-11 bg-background rounded-xl font-medium text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Category</label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-11 bg-background rounded-xl font-medium text-sm text-foreground">
                  <SelectValue className="text-foreground" />
                </SelectTrigger>
                <SelectContent className="z-[400]">
                  {["sales", "support", "followup"].map(c => (
                    <SelectItem key={c} value={c} className="capitalize font-medium text-sm text-foreground dark:text-foreground">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Message Content</label>
              <Textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Type your message here..."
                className="min-h-[400px] bg-background border-border rounded-xl p-4 text-sm resize-none font-normal leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{newBody.length} characters</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/60">
            <Button
              variant="secondary"
              onClick={() => setIsCreateDialogOpen(false)}
              className="h-10 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !newTitle.trim() || !newBody.trim()}
              className="h-10 rounded-lg bg-primary hover:bg-primary/90 text-white"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT TEMPLATE DIALOG */}
      <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Edit3 className="w-5 h-5 text-primary" />
              Edit Template
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Update your template content and details.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto custom-scrollbar mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Title</label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Template title"
                className="h-11 bg-background rounded-xl font-medium text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Category</label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-11 bg-background rounded-xl font-medium text-sm text-foreground">
                  <SelectValue className="text-foreground" />
                </SelectTrigger>
                <SelectContent className="z-[400]">
                  {["sales", "support", "followup"].map(c => (
                    <SelectItem key={c} value={c} className="capitalize font-medium text-sm text-foreground dark:text-foreground">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Message Content</label>
              <Textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Type your message here..."
                className="min-h-[400px] bg-background border-border rounded-xl p-4 text-sm resize-none font-normal leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{newBody.length} characters</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/60">
            <Button
              variant="secondary"
              onClick={resetForm}
              className="h-10 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending || !newTitle.trim() || !newBody.trim()}
              className="h-10 rounded-lg bg-amber-600 dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-600 text-white"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: hsl(var(--border)); 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary) / 0.2); }
      `}</style>
    </div>
  );
}