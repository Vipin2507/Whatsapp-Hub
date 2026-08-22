import { useState } from "react";
import {
  X,
  Sparkles,
  Search,
  Edit3,
  Trash2,
  Loader2,
  Plus,
  Check,
  ChevronLeft,
  Library,
  Copy,
  Save,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Template } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
import { StatusPill } from "@/components/PendingChip";

interface TemplateLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (body: string) => void;
}

const CATEGORIES = ["sales", "support", "followup"] as const;

function categoryLabel(category: string) {
  if (category === "followup") return "Follow-up";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function categoryTone(category: string) {
  switch (category.toLowerCase()) {
    case "sales":
      return "info" as const;
    case "support":
      return "success" as const;
    case "followup":
      return "warning" as const;
    default:
      return "muted" as const;
  }
}

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export function TemplateLabModal({ isOpen, onClose, onSelectTemplate }: TemplateLabModalProps) {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
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

  const resetForm = () => {
    setEditingId(null);
    setNewTitle("");
    setNewCategory("sales");
    setNewBody("");
    setIsCreateDialogOpen(false);
  };

  const handleCopy = async (id: number, text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!successful) throw new Error("Copy failed");
      }
      setCopiedId(id);
      toast.success("Copied");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Could not copy");
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
    setIsCreateDialogOpen(false);
  };

  const createMutation = useMutation({
    mutationFn: api.templates.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      resetForm();
      toast.success("Template created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Template> }) => api.templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      resetForm();
      toast.success("Template saved");
    },
  });

  const aiMutation = useMutation({
    mutationFn: (prompt: string) => api.templates.aiGenerate(prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setAiPrompt("");
      toast.success("Template generated");
    },
    onError: () => toast.error("Could not generate template"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template removed");
    },
  });

  const handleSubmit = () => {
    if (!newTitle || !newBody) {
      toast.error("Title and body are required");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { title: newTitle, body: newBody, category: newCategory } });
    } else {
      createMutation.mutate({ title: newTitle, body: newBody, category: newCategory });
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
    const matchesCategory = selectedCategory === "All" || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formOpen = isCreateDialogOpen || editingId !== null;
  const saving = createMutation.isPending || updateMutation.isPending;

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
              <Library className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight">Templates</h2>
              <p className="text-[11px] tabular-nums text-muted-foreground">{templates.length} saved</p>
            </div>
          </div>
        </div>
        <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:max-w-sm">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates"
              className="h-9 pl-8"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0 text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="app-split">
        <aside className="app-split-side chat-scroll max-h-[42dvh] space-y-3 lg:max-h-none">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Generate
            </h3>
            <div className="card-soft space-y-2 p-3">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe the message you need…"
                className="min-h-[88px] resize-none text-sm"
              />
              <Button
                onClick={() => aiMutation.mutate(aiPrompt)}
                disabled={aiMutation.isPending || !aiPrompt.trim()}
                className="h-9 w-full"
              >
                {aiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate with AI"}
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
            className="h-9 w-full"
          >
            <Plus className="h-3.5 w-3.5" />
            New template
          </Button>
        </aside>

        <main className="chat-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{filteredTemplates.length}</span>
              {" of "}
              <span className="font-medium tabular-nums text-foreground">{templates.length}</span>
            </p>
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {["All", ...CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium capitalize",
                    selectedCategory === cat
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {cat === "All" ? "All" : categoryLabel(cat)}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-[11px] text-muted-foreground">Loading templates</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
              <Library className="mb-1 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No templates found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "card-soft p-3",
                    editingId === t.id && "ring-1 ring-primary/30",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-sm font-medium">{t.title}</h3>
                        <StatusPill label={categoryLabel(t.category)} tone={categoryTone(t.category)} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{t.body}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => handleCopy(t.id, t.body)}
                    >
                      {copiedId === t.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => handleEditInitiate(t)}>
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this template?")) deleteMutation.mutate(t.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                    {onSelectTemplate ? (
                      <Button size="sm" className="ml-auto h-8" onClick={() => handleDeploy(t.body)}>
                        Use
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="flex max-h-[min(90dvh,100%)] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                {editingId ? <Edit3 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
              {editingId ? "Edit template" : "New template"}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Update the title, category, and message." : "Save a reusable WhatsApp message."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="space-y-1">
              <label className={fieldLabel}>Title</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Template title" className="h-9" />
            </div>
            <div className="space-y-1">
              <label className={fieldLabel}>Category</label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className={fieldLabel}>Message</label>
              <Textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Type the message…"
                className="min-h-[140px] resize-y text-sm sm:min-h-[200px]"
              />
              <p className="text-[11px] tabular-nums text-muted-foreground">{newBody.length} characters</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={resetForm} className="h-9">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !newTitle.trim() || !newBody.trim()} className="h-9">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
