import { useState } from "react";
import {
  X, ChevronLeft, Plus, Loader2, Trash2, Edit3, Save,
  MessageSquare, Users, Layers, Clock, Zap, ArrowRight,
  CheckCircle2, AlertCircle, Play, Pause, Copy, Eye, Search, User,
  Library, Calendar, Timer
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Conversation, ConversationDetail, ConversationStep, ConversationTrigger, ConversationTriggerType, Template } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ConversationViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConversationView({ isOpen, onClose }: ConversationViewProps) {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<ConversationStep | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<ConversationTrigger | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // New conversation form state
  const [newConvName, setNewConvName] = useState("");
  const [newConvDescription, setNewConvDescription] = useState("");
  const [newConvTargetType, setNewConvTargetType] = useState<"contact" | "list">("contact");
  const [newConvTargetPhone, setNewConvTargetPhone] = useState("");
  const [newConvTargetListId, setNewConvTargetListId] = useState<string>("");
  const [newConvScheduledTime, setNewConvScheduledTime] = useState("");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.conversations.getAll,
    enabled: isOpen,
  });

  const { data: conversationDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["conversation", selectedConversationId],
    queryFn: () => api.conversations.get(selectedConversationId!),
    enabled: isOpen && selectedConversationId != null,
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: api.lists.getAll,
    enabled: isOpen,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
    enabled: isOpen,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.getAll,
    enabled: isOpen,
  });

  const [contactSearch, setContactSearch] = useState("");
  const [useExistingContact, setUseExistingContact] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  
  // Steps during creation
  const [createSteps, setCreateSteps] = useState<Array<{ message_content: string; delay_after_seconds: number; delay_unit: "seconds" | "minutes" | "hours" | "days" | "months"; step_order: number }>>([
    { message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }
  ]);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [selectedStepForTemplate, setSelectedStepForTemplate] = useState<number | null>(null);
  const [useExistingConversation, setUseExistingConversation] = useState(false);
  const [selectedConversationTemplateId, setSelectedConversationTemplateId] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: async () => {
      let stepsToCreate = createSteps.filter(s => s.message_content.trim());
      
      // If using existing conversation template, load its steps
      if (useExistingConversation && selectedConversationTemplateId) {
        const templateConv = await api.conversations.get(parseInt(selectedConversationTemplateId));
        if (templateConv && templateConv.steps) {
          stepsToCreate = templateConv.steps.map((s: ConversationStep, idx: number) => ({
            message_content: s.message_content,
            delay_after_seconds: s.delay_after_seconds || 0,
            delay_unit: "seconds" as const,
            step_order: idx,
          }));
        }
      }
      
      // Convert delay units to seconds
      const convertDelayToSeconds = (value: number, unit: string): number => {
        switch (unit) {
          case "seconds": return value;
          case "minutes": return value * 60;
          case "hours": return value * 3600;
          case "days": return value * 86400;
          case "months": return value * 2592000; // ~30 days
          default: return value;
        }
      };
      
      // Create conversation first
      const convData = await api.conversations.create({
        name: newConvName,
        description: newConvDescription,
        target_type: newConvTargetType,
        target_phone: newConvTargetType === "contact"
          ? (useExistingContact && selectedContactId
              ? contacts.find((c: any) => String(c.id) === selectedContactId)?.phone
              : newConvTargetPhone)
          : undefined,
        target_list_id: newConvTargetType === "list" ? parseInt(newConvTargetListId) : undefined,
        initial_scheduled_time: newConvScheduledTime || undefined,
        is_active: true,
      });
      
      // Add steps
      for (const step of stepsToCreate) {
        const delayInSeconds = convertDelayToSeconds(step.delay_after_seconds, step.delay_unit || "seconds");
        await api.conversations.addStep(convData.id, {
          step_order: step.step_order,
          message_content: step.message_content,
          delay_after_seconds: delayInSeconds,
        });
      }
      
      return convData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setShowCreateDialog(false);
      setNewConvName("");
      setNewConvDescription("");
      setNewConvTargetPhone("");
      setNewConvTargetListId("");
      setNewConvScheduledTime("");
      setUseExistingContact(false);
      setSelectedContactId("");
      setContactSearch("");
      setCreateSteps([{ message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }]);
      setUseExistingConversation(false);
      setSelectedConversationTemplateId("");
      setSelectedConversationId(data.id);
      toast.success("Conversation created with steps");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create conversation"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.conversations.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (selectedConversationId) setSelectedConversationId(null);
      toast.success("Conversation deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Conversation> }) =>
      api.conversations.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
      toast.success("Conversation updated");
    },
  });

  const addStepMutation = useMutation({
    mutationFn: ({ convId, step }: { convId: number; step: ConversationStep }) =>
      api.conversations.addStep(convId, step),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
      setEditingStep(null);
      toast.success("Step added");
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: ({ convId, stepId }: { convId: number; stepId: number }) =>
      api.conversations.deleteStep(convId, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
      toast.success("Step deleted");
    },
  });

  const addTriggerMutation = useMutation({
    mutationFn: ({ convId, trigger }: { convId: number; trigger: ConversationTrigger }) =>
      api.conversations.addTrigger(convId, trigger),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
      setEditingTrigger(null);
      toast.success("Trigger added");
    },
  });

  const deleteTriggerMutation = useMutation({
    mutationFn: ({ convId, triggerId }: { convId: number; triggerId: number }) =>
      api.conversations.deleteTrigger(convId, triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
      toast.success("Trigger deleted");
    },
  });

  const normalizedContactSearch = contactSearch.trim().toLowerCase();
  const filteredContacts = normalizedContactSearch
    ? contacts.filter((c: any) => {
        const name = String(c?.name || "").toLowerCase();
        const phone = String(c?.phone || "").toLowerCase();
        return name.includes(normalizedContactSearch) || phone.includes(normalizedContactSearch);
      })
    : contacts;

  if (!isOpen) return null;

  return (
    <div className="app-overlay z-[100]">
      {/* Header */}
      <div className="app-overlay-header">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <Button variant="ghost" onClick={onClose} className="gap-3 text-muted-foreground hover:text-primary">
            <ChevronLeft className="w-5 h-5" /> Back
          </Button>
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
              <MessageSquare className="w-7 h-7 text-violet-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight sm:text-lg">Conversations</h2>
              <p className="hidden text-[10px] text-muted-foreground sm:block">Automated message flows</p>
            </div>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm" className="h-8 shrink-0">
          <Plus className="w-4 h-4" /> New Conversation
        </Button>
      </div>

      <div className="app-split">
        {/* Main: Conversation List Grid */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="table-scroll">
          <div className="min-w-[640px] lg:min-w-0">
          {/* Grid Headers */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b-2 border-border/60 bg-muted/20 rounded-t-lg items-center mb-4">
            <div className="col-span-3 font-semibold">Name</div>
            <div className="col-span-2 text-center font-semibold">Status</div>
            <div className="col-span-2 text-center font-semibold">Target</div>
            <div className="col-span-2 text-center font-semibold">Steps</div>
            <div className="col-span-2 text-center font-semibold">Created</div>
            <div className="col-span-1 text-right font-semibold">Actions</div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs mt-1">Create one to get started</p>
            </div>
          ) : (
            <div className="space-y-1 pb-20">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={cn(
                    "grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-border/30 transition-all duration-150 group hover:bg-muted/30 cursor-pointer",
                    selectedConversationId === conv.id && "bg-violet-500/10 border-l-2 border-l-violet-500"
                  )}
                >
                  <div className="col-span-3 min-w-0">
                    <h4 className="text-sm font-semibold truncate">{conv.name}</h4>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.description || "No description"}</p>
                  </div>
                  <div className="col-span-2 text-center">
                    {conv.is_active ? (
                      <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] h-5">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px] h-5">Inactive</Badge>
                    )}
                  </div>
                  <div className="col-span-2 text-center text-xs text-muted-foreground">
                    {conv.target_type === "contact" ? (
                      <span className="flex items-center justify-center gap-1">
                        <Users className="w-3 h-3" /> Contact
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1">
                        <Layers className="w-3 h-3" /> List
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-center text-xs font-medium text-foreground">
                    {conv.step_count || 0} steps
                  </div>
                  <div className="col-span-2 text-center text-xs text-muted-foreground">
                    {conv.created_at ? new Date(conv.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this conversation?")) {
                          deleteMutation.mutate(conv.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
          </div>
        </main>

        {/* Right Panel: Conversation Builder (when selected) */}
        {selectedConversationId !== null && (
          <aside className="min-h-0 w-full shrink-0 overflow-y-auto border-t bg-muted/20 p-3 sm:p-6 lg:w-[min(100%,28rem)] lg:border-l lg:border-t-0">
            {detailLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : conversationDetail ? (
            <div className="max-w-4xl space-y-6">
              {/* Conversation Header */}
              <div className="flex items-start justify-between gap-4 p-4 bg-card/50 rounded-xl border border-border">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold">{conversationDetail.name}</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateMutation.mutate({
                        id: conversationDetail.id,
                        data: { is_active: !conversationDetail.is_active }
                      })}
                      className="h-7"
                    >
                      {conversationDetail.is_active ? (
                        <>
                          <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 mr-1.5" /> Activate
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{conversationDetail.description || "No description"}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Target: {conversationDetail.target_type === "contact" ? conversationDetail.target_phone : `List #${conversationDetail.target_list_id}`}</span>
                    {conversationDetail.initial_scheduled_time && (
                      <span>Starts: {new Date(conversationDetail.initial_scheduled_time).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Steps</h3>
                  <Button
                    size="sm"
                    onClick={() => {
                      const maxOrder = Math.max(...(conversationDetail.steps.map(s => s.step_order) || [0]), -1);
                      setEditingStep({
                        step_order: maxOrder + 1,
                        message_content: "",
                        delay_after_seconds: 0,
                      });
                    }}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Step
                  </Button>
                </div>

                <div className="space-y-3">
                  {conversationDetail.steps
                    .sort((a, b) => a.step_order - b.step_order)
                    .map((step) => (
                      <div key={step.id} className="p-4 bg-card/50 rounded-xl border border-border">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300">
                                Step {step.step_order}
                              </Badge>
                              {step.delay_after_seconds > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Delay: {step.delay_after_seconds}s
                                </span>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{step.message_content}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingStep(step)}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (confirm("Delete this step?")) {
                                  deleteStepMutation.mutate({ convId: conversationDetail.id, stepId: step.id! });
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Triggers for this step */}
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-muted-foreground">Triggers → Next Step</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => {
                                setEditingTrigger({
                                  from_step_id: step.id!,
                                  to_step_id: conversationDetail.steps.find(s => s.step_order > step.step_order)?.id || step.id!,
                                  trigger_type: "keyword",
                                  trigger_value: [],
                                });
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" /> Add Trigger
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            {conversationDetail.triggers
                              .filter(t => t.from_step_id === step.id)
                              .map((trigger) => {
                                const toStep = conversationDetail.steps.find(s => s.id === trigger.to_step_id);
                                return (
                                  <div key={trigger.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">
                                        {trigger.trigger_type === "any" && "Any message"}
                                        {trigger.trigger_type === "keyword" && `Keywords: ${Array.isArray(trigger.trigger_value) ? trigger.trigger_value.join(", ") : trigger.trigger_value}`}
                                        {trigger.trigger_type === "exact" && `Exact: "${trigger.trigger_value}"`}
                                        {trigger.trigger_type === "contains" && `Contains: "${trigger.trigger_value}"`}
                                        {trigger.trigger_type === "regex" && `Regex: ${trigger.trigger_value}`}
                                      </span>
                                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">Step {toStep?.step_order || "?"}</span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => {
                                        if (confirm("Delete this trigger?")) {
                                          deleteTriggerMutation.mutate({ convId: conversationDetail.id, triggerId: trigger.id! });
                                        }
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                            {conversationDetail.triggers.filter(t => t.from_step_id === step.id).length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No triggers yet</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Conversation not found</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Create Conversation Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b border-border">
            <DialogTitle className="text-2xl font-bold">Create New Conversation</DialogTitle>
            <DialogDescription className="text-sm">Set up an automated message flow with multiple steps</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-6 p-1 custom-scrollbar">
            {/* Use Existing Conversation Option */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-500" />
                  Use Existing Conversation Template
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseExistingConversation(!useExistingConversation);
                    if (useExistingConversation) {
                      setSelectedConversationTemplateId("");
                      setCreateSteps([{ message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }]);
                    }
                  }}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-all flex items-center px-0.5 shrink-0",
                    useExistingConversation ? "bg-violet-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "block w-5 h-5 bg-white rounded-full transition-transform shadow",
                      useExistingConversation ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
              {useExistingConversation && (
                <Select value={selectedConversationTemplateId} onValueChange={async (val) => {
                  setSelectedConversationTemplateId(val);
                  if (val) {
                    try {
                      const templateConv = await api.conversations.get(parseInt(val));
                      if (templateConv && templateConv.steps) {
                        setCreateSteps(templateConv.steps.map((s: ConversationStep, idx: number) => ({
                          message_content: s.message_content,
                          delay_after_seconds: s.delay_after_seconds || 0,
                          delay_unit: "seconds" as const,
                          step_order: idx,
                        })));
                        setNewConvName(templateConv.name + " (Copy)");
                        setNewConvDescription(templateConv.description || "");
                        toast.success(`Loaded ${templateConv.steps.length} steps from template`);
                      }
                    } catch (err) {
                      toast.error("Failed to load conversation template");
                    }
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select conversation template..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                    {conversations.map((conv) => (
                      <SelectItem key={conv.id} value={String(conv.id)}>
                        <div className="flex items-center justify-between w-full">
                          <span>{conv.name}</span>
                          <Badge variant="outline" className="ml-2 text-[9px]">
                            {conv.step_count || 0} steps
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <Input
                value={newConvName}
                onChange={(e) => setNewConvName(e.target.value)}
                placeholder="e.g. Order Follow-up"
                disabled={useExistingConversation && selectedConversationTemplateId !== ""}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Textarea
                value={newConvDescription}
                onChange={(e) => setNewConvDescription(e.target.value)}
                placeholder="Describe this conversation flow..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Target</label>
              <Select value={newConvTargetType} onValueChange={(v) => setNewConvTargetType(v as "contact" | "list")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                  <SelectItem value="contact">Single Contact</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                </SelectContent>
              </Select>
              {newConvTargetType === "contact" ? (
                <div className="mt-2 space-y-2">
                  <div className="flex bg-secondary/50 p-1 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => { setUseExistingContact(false); setSelectedContactId(""); }}
                      className={cn(
                        "flex-1 py-2 rounded-md text-xs font-semibold transition-all",
                        !useExistingContact
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <User className="w-3.5 h-3.5 inline mr-1.5" /> New Number
                    </button>
                    <button
                      type="button"
                      onClick={() => { setUseExistingContact(true); setNewConvTargetPhone(""); setContactSearch(""); }}
                      className={cn(
                        "flex-1 py-2 rounded-md text-xs font-semibold transition-all",
                        useExistingContact
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Users className="w-3.5 h-3.5 inline mr-1.5" /> Existing Contact
                    </button>
                  </div>
                  {useExistingContact ? (
                    <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                      <SelectTrigger>
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
                            <div className="p-2 border-b border-border/60 sticky top-0 bg-popover z-10">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                  value={contactSearch}
                                  onChange={(e) => setContactSearch(e.target.value)}
                                  placeholder="Search by name or number..."
                                  className="h-9 pl-10 pr-9 bg-background rounded-lg font-medium text-sm"
                                />
                                {contactSearch && (
                                  <button
                                    type="button"
                                    onClick={() => setContactSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={newConvTargetPhone}
                      onChange={(e) => setNewConvTargetPhone(e.target.value)}
                      placeholder="Phone number"
                    />
                  )}
                  {(useExistingContact && selectedContactId) && (
                    <p className="text-xs text-muted-foreground">
                      {contacts.find((c: any) => String(c.id) === selectedContactId)?.phone || ""}
                    </p>
                  )}
                </div>
              ) : (
                <Select value={newConvTargetListId} onValueChange={setNewConvTargetListId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select list" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.title} ({l.count} contacts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Start Date
                </label>
                <Input
                  type="date"
                  value={newConvScheduledTime ? newConvScheduledTime.split('T')[0] : ""}
                  onChange={(e) => {
                    const date = e.target.value;
                    const time = newConvScheduledTime.includes('T') ? newConvScheduledTime.split('T')[1] : "09:00";
                    setNewConvScheduledTime(date ? `${date}T${time}` : "");
                  }}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Start Time
                </label>
                <Input
                  type="time"
                  value={newConvScheduledTime && newConvScheduledTime.includes('T') ? newConvScheduledTime.split('T')[1] : "09:00"}
                  onChange={(e) => {
                    const time = e.target.value;
                    const date = newConvScheduledTime.split('T')[0] || new Date().toISOString().split('T')[0];
                    setNewConvScheduledTime(`${date}T${time}`);
                  }}
                />
              </div>
            </div>

            {/* Steps Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-violet-500" />
                    Conversation Steps
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Add messages that will be sent in sequence</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreateSteps([...createSteps, {
                      message_content: "",
                      delay_after_seconds: 0,
                      delay_unit: "seconds",
                      step_order: createSteps.length
                    }]);
                  }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Step
                </Button>
              </div>

              <div className="space-y-4">
                {createSteps.map((step, index) => (
                  <div key={index} className="p-4 bg-card/50 rounded-xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300">
                          Step {index + 1}
                        </Badge>
                        {index > 0 && createSteps[index - 1].delay_after_seconds > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {createSteps[index - 1].delay_after_seconds}s delay after step {index}
                          </span>
                        )}
                      </div>
                      {createSteps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            setCreateSteps(createSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i })));
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Textarea
                          value={step.message_content}
                          onChange={(e) => {
                            const updated = [...createSteps];
                            updated[index].message_content = e.target.value;
                            setCreateSteps(updated);
                          }}
                          placeholder="Enter message content..."
                          rows={4}
                          className="resize-none"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => {
                          setSelectedStepForTemplate(index);
                          setShowTemplateLibrary(true);
                        }}
                        title="Select from templates"
                      >
                        <Library className="w-4 h-4" />
                      </Button>
                    </div>
                    {index < createSteps.length - 1 && (
                      <div className="flex items-center gap-3 pt-3 border-t border-border/50 bg-muted/20 p-3 rounded-lg">
                        <label className="text-xs font-semibold text-foreground flex items-center gap-2 shrink-0">
                          <Timer className="w-3.5 h-3.5 text-violet-500" />
                          Delay after this step:
                        </label>
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="number"
                            min={0}
                            value={step.delay_after_seconds}
                            onChange={(e) => {
                              const updated = [...createSteps];
                              updated[index].delay_after_seconds = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setCreateSteps(updated);
                            }}
                            className="w-24 h-9 text-sm font-medium"
                            placeholder="0"
                          />
                          <Select
                            value={step.delay_unit || "seconds"}
                            onValueChange={(v: "seconds" | "minutes" | "hours" | "days" | "months") => {
                              const updated = [...createSteps];
                              updated[index].delay_unit = v;
                              setCreateSteps(updated);
                            }}
                          >
                            <SelectTrigger className="w-32 h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border z-[200]" style={{ zIndex: 9999 }}>
                              <SelectItem value="seconds">Seconds</SelectItem>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                              <SelectItem value="months">Months</SelectItem>
                            </SelectContent>
                          </Select>
                          {step.delay_after_seconds > 0 && (
                            <span className="text-xs text-violet-600 dark:text-violet-400 font-semibold ml-2">
                              {(() => {
                                const totalSeconds = step.delay_unit === "seconds" ? step.delay_after_seconds
                                  : step.delay_unit === "minutes" ? step.delay_after_seconds * 60
                                  : step.delay_unit === "hours" ? step.delay_after_seconds * 3600
                                  : step.delay_unit === "days" ? step.delay_after_seconds * 86400
                                  : step.delay_after_seconds * 2592000;
                                const days = Math.floor(totalSeconds / 86400);
                                const hours = Math.floor((totalSeconds % 86400) / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                const seconds = totalSeconds % 60;
                                const parts = [];
                                if (days > 0) parts.push(`${days}d`);
                                if (hours > 0) parts.push(`${hours}h`);
                                if (minutes > 0) parts.push(`${minutes}m`);
                                if (seconds > 0 && days === 0) parts.push(`${seconds}s`);
                                return `(${parts.join(" ")})`;
                              })()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border bg-card/50 px-1 -mx-1">
            <Button variant="secondary" onClick={() => {
              setShowCreateDialog(false);
              setCreateSteps([{ message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }]);
              setUseExistingConversation(false);
              setSelectedConversationTemplateId("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !newConvName ||
                (newConvTargetType === "contact" && !useExistingContact && !newConvTargetPhone) ||
                (newConvTargetType === "contact" && useExistingContact && !selectedContactId) ||
                (newConvTargetType === "list" && !newConvTargetListId) ||
                createSteps.filter(s => s.message_content.trim()).length === 0
              }
              className="bg-violet-600 hover:bg-violet-700 min-w-[120px]"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Conversation
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Library Dialog */}
      <Dialog open={showTemplateLibrary} onOpenChange={setShowTemplateLibrary}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Library className="w-5 h-5 text-primary" />
              Select Template
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Choose a template to use for step {selectedStepForTemplate !== null ? selectedStepForTemplate + 1 : ""}
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
                    type="button"
                    onClick={() => {
                      if (selectedStepForTemplate !== null) {
                        const updated = [...createSteps];
                        updated[selectedStepForTemplate].message_content = t.body;
                        setCreateSteps(updated);
                        setShowTemplateLibrary(false);
                        setSelectedStepForTemplate(null);
                        toast.success(`Template "${t.title}" added to step ${selectedStepForTemplate + 1}`);
                      }
                    }}
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

      {/* Edit Step Dialog */}
      <Dialog open={editingStep !== null} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Step</DialogTitle>
          </DialogHeader>
          {editingStep && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <Textarea
                  value={editingStep.message_content}
                  onChange={(e) => setEditingStep({ ...editingStep, message_content: e.target.value })}
                  rows={5}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Delay After Trigger (seconds)</label>
                <Input
                  type="number"
                  min={0}
                  value={editingStep.delay_after_seconds || 0}
                  onChange={(e) => setEditingStep({ ...editingStep, delay_after_seconds: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="secondary" onClick={() => setEditingStep(null)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (editingStep.id) {
                      // Update existing
                      api.conversations.updateStep(selectedConversationId!, editingStep.id, editingStep).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
                        setEditingStep(null);
                        toast.success("Step updated");
                      });
                    } else {
                      // Add new
                      addStepMutation.mutate({ convId: selectedConversationId!, step: editingStep });
                    }
                  }}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Trigger Dialog */}
      <Dialog open={editingTrigger !== null} onOpenChange={(open) => !open && setEditingTrigger(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Trigger</DialogTitle>
          </DialogHeader>
          {editingTrigger && conversationDetail && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Trigger Type</label>
                <Select
                  value={editingTrigger.trigger_type}
                  onValueChange={(v) => setEditingTrigger({ ...editingTrigger, trigger_type: v as ConversationTriggerType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any message</SelectItem>
                    <SelectItem value="keyword">Keyword(s)</SelectItem>
                    <SelectItem value="exact">Exact match</SelectItem>
                    <SelectItem value="contains">Contains text</SelectItem>
                    <SelectItem value="regex">Regex pattern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingTrigger.trigger_type !== "any" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    {editingTrigger.trigger_type === "keyword" ? "Keywords (comma-separated)" : "Value"}
                  </label>
                  <Input
                    value={Array.isArray(editingTrigger.trigger_value) ? editingTrigger.trigger_value.join(", ") : (editingTrigger.trigger_value || "")}
                    onChange={(e) => {
                      const val = editingTrigger.trigger_type === "keyword"
                        ? e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                        : e.target.value;
                      setEditingTrigger({ ...editingTrigger, trigger_value: val });
                    }}
                    placeholder={editingTrigger.trigger_type === "keyword" ? "hello, hi, hey" : "Enter value"}
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">To Step</label>
                <Select
                  value={String(editingTrigger.to_step_id)}
                  onValueChange={(v) => setEditingTrigger({ ...editingTrigger, to_step_id: parseInt(v, 10) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conversationDetail.steps.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        Step {s.step_order}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="case-sensitive"
                  checked={editingTrigger.is_case_sensitive || false}
                  onChange={(e) => setEditingTrigger({ ...editingTrigger, is_case_sensitive: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="case-sensitive" className="text-sm">Case sensitive</label>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="secondary" onClick={() => setEditingTrigger(null)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (editingTrigger.id) {
                      api.conversations.updateTrigger(selectedConversationId!, editingTrigger.id, editingTrigger).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
                        setEditingTrigger(null);
                        toast.success("Trigger updated");
                      });
                    } else {
                      addTriggerMutation.mutate({ convId: selectedConversationId!, trigger: editingTrigger });
                    }
                  }}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}
