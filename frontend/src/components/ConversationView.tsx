import { useMemo, useState } from "react";
import {
  X,
  ChevronLeft,
  Plus,
  Loader2,
  Trash2,
  Edit3,
  MessageSquare,
  Layers,
  Clock,
  ArrowRight,
  Play,
  Pause,
  Search,
  User,
  Library,
  Calendar,
  Timer,
  Bot,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  Conversation,
  ConversationStep,
  ConversationTrigger,
  ConversationTriggerType,
  Contact,
  LeadList,
} from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DateField, TimeField } from "@/components/DateFields";
import { PhoneField } from "@/components/PhoneField";
import { StatusPill } from "@/components/PendingChip";
import { composeDialedNumber } from "@/lib/countries";
import { useAppPreferences } from "@/hooks/use-app-settings";

interface ConversationViewProps {
  isOpen: boolean;
  onClose: () => void;
}

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

type DelayUnit = "seconds" | "minutes" | "hours" | "days" | "months";

function delayToSeconds(value: number, unit: string): number {
  switch (unit) {
    case "minutes":
      return value * 60;
    case "hours":
      return value * 3600;
    case "days":
      return value * 86400;
    case "months":
      return value * 2592000;
    default:
      return value;
  }
}

function formatDelay(seconds?: number) {
  const total = seconds || 0;
  if (total <= 0) return null;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs && days === 0) parts.push(`${secs}s`);
  return parts.join(" ") || `${total}s`;
}

function triggerLabel(trigger: ConversationTrigger) {
  const value = Array.isArray(trigger.trigger_value)
    ? trigger.trigger_value.join(", ")
    : trigger.trigger_value || "";
  switch (trigger.trigger_type) {
    case "any":
      return "Any message";
    case "keyword":
      return `Keywords: ${value}`;
    case "exact":
      return `Exact: "${value}"`;
    case "contains":
      return `Contains: "${value}"`;
    case "regex":
      return `Regex: ${value}`;
    default:
      return value;
  }
}

export function ConversationView({ isOpen, onClose }: ConversationViewProps) {
  const queryClient = useQueryClient();
  const prefs = useAppPreferences();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<ConversationStep | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<ConversationTrigger | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [search, setSearch] = useState("");

  const [newConvName, setNewConvName] = useState("");
  const [newConvDescription, setNewConvDescription] = useState("");
  const [newConvTargetType, setNewConvTargetType] = useState<"contact" | "list">("contact");
  const [newConvTargetPhone, setNewConvTargetPhone] = useState("");
  const [newConvCountryCode, setNewConvCountryCode] = useState(prefs.default_country_code);
  const [newConvTargetListId, setNewConvTargetListId] = useState("");
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
  const [selectedContactId, setSelectedContactId] = useState("");
  const [createSteps, setCreateSteps] = useState<
    Array<{ message_content: string; delay_after_seconds: number; delay_unit: DelayUnit; step_order: number }>
  >([{ message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }]);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [selectedStepForTemplate, setSelectedStepForTemplate] = useState<number | null>(null);
  const [useExistingConversation, setUseExistingConversation] = useState(false);
  const [selectedConversationTemplateId, setSelectedConversationTemplateId] = useState("");

  const resetCreateForm = () => {
    setNewConvName("");
    setNewConvDescription("");
    setNewConvTargetPhone("");
    setNewConvCountryCode(prefs.default_country_code);
    setNewConvTargetListId("");
    setNewConvScheduledTime("");
    setUseExistingContact(false);
    setSelectedContactId("");
    setContactSearch("");
    setCreateSteps([{ message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }]);
    setUseExistingConversation(false);
    setSelectedConversationTemplateId("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      let stepsToCreate = createSteps.filter((s) => s.message_content.trim());

      if (useExistingConversation && selectedConversationTemplateId) {
        const templateConv = await api.conversations.get(parseInt(selectedConversationTemplateId, 10));
        if (templateConv?.steps) {
          stepsToCreate = templateConv.steps.map((s: ConversationStep, idx: number) => ({
            message_content: s.message_content,
            delay_after_seconds: s.delay_after_seconds || 0,
            delay_unit: "seconds" as const,
            step_order: idx,
          }));
        }
      }

      const convData = await api.conversations.create({
        name: newConvName,
        description: newConvDescription,
        target_type: newConvTargetType,
        target_phone:
          newConvTargetType === "contact"
            ? useExistingContact && selectedContactId
              ? contacts.find((c: Contact) => String(c.id) === selectedContactId)?.phone
              : composeDialedNumber(newConvCountryCode, newConvTargetPhone)
            : undefined,
        target_list_id: newConvTargetType === "list" ? parseInt(newConvTargetListId, 10) : undefined,
        initial_scheduled_time: newConvScheduledTime || undefined,
        is_active: true,
      });

      for (const step of stepsToCreate) {
        await api.conversations.addStep(convData.id, {
          step_order: step.step_order,
          message_content: step.message_content,
          delay_after_seconds: delayToSeconds(step.delay_after_seconds, step.delay_unit || "seconds"),
        });
      }

      return convData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setShowCreateDialog(false);
      resetCreateForm();
      setSelectedConversationId(data.id);
      toast.success("Conversation created");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create conversation"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.conversations.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (selectedConversationId === id) setSelectedConversationId(null);
      toast.success("Conversation deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Conversation> }) => api.conversations.update(id, data),
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

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c: Contact) =>
        (c.name || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q),
    );
  }, [contacts, contactSearch]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.target_phone || "").includes(q),
    );
  }, [conversations, search]);

  const listTitle = (id?: number) => lists.find((l: LeadList) => l.id === id)?.title || (id ? `List #${id}` : "—");

  if (!isOpen) return null;

  return (
    <div className="app-overlay z-[100]">
      <header className="app-overlay-header">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 gap-1 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">Conversations</h2>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {conversations.length} flow{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="relative ml-auto w-32 min-w-0 sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flows"
            className="h-8 pl-8"
          />
        </div>
        <Button size="sm" className="h-8 shrink-0" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </header>

      <div className="app-split">
        <main className="chat-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="table-scroll">
            <div className="card-soft min-w-[640px] overflow-hidden lg:min-w-0">
              <div className="grid grid-cols-12 items-center gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <div className="col-span-4">Name</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-center">Target</div>
                <div className="col-span-1 text-center">Steps</div>
                <div className="col-span-2 text-center">Created</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <p className="text-[11px] text-muted-foreground">Loading conversations</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
                  <Bot className="mb-1 h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {conversations.length === 0 ? "No conversation flows yet" : "No flows match that search"}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={cn(
                      "grid cursor-pointer grid-cols-12 items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-muted/30",
                      selectedConversationId === conv.id && "bg-primary/5",
                    )}
                  >
                    <div className="col-span-4 min-w-0">
                      <p className="truncate text-sm font-medium">{conv.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{conv.description || "No description"}</p>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <StatusPill label={conv.is_active ? "Active" : "Paused"} tone={conv.is_active ? "success" : "muted"} />
                    </div>
                    <div className="col-span-2 truncate text-center text-xs text-muted-foreground">
                      {conv.target_type === "contact" ? conv.target_phone || "Contact" : listTitle(conv.target_list_id)}
                    </div>
                    <div className="col-span-1 text-center text-xs tabular-nums">{conv.step_count || 0}</div>
                    <div className="col-span-2 text-center text-[11px] tabular-nums text-muted-foreground">
                      {conv.created_at
                        ? new Date(conv.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "—"}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this conversation?")) deleteMutation.mutate(conv.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

        {selectedConversationId != null ? (
          <aside className="flex max-h-[48dvh] min-h-0 w-full shrink-0 flex-col border-t bg-card lg:max-h-none lg:w-[min(100%,24rem)] lg:border-l lg:border-t-0">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Loading flow</p>
              </div>
            ) : conversationDetail ? (
              <>
                <div className="shrink-0 space-y-2 border-b p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold tracking-tight">{conversationDetail.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {conversationDetail.description || "No description"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => setSelectedConversationId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill
                      label={conversationDetail.is_active ? "Active" : "Paused"}
                      tone={conversationDetail.is_active ? "success" : "muted"}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {conversationDetail.target_type === "contact"
                        ? conversationDetail.target_phone || "Contact"
                        : listTitle(conversationDetail.target_list_id)}
                    </span>
                  </div>
                  {conversationDetail.initial_scheduled_time ? (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Starts {new Date(conversationDetail.initial_scheduled_time).toLocaleString()}
                    </p>
                  ) : null}
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() =>
                        updateMutation.mutate({
                          id: conversationDetail.id,
                          data: { is_active: !conversationDetail.is_active },
                        })
                      }
                    >
                      {conversationDetail.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {conversationDetail.is_active ? "Pause" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        const maxOrder = Math.max(...conversationDetail.steps.map((s) => s.step_order), -1);
                        setEditingStep({
                          step_order: maxOrder + 1,
                          message_content: "",
                          delay_after_seconds: 0,
                        });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Step
                    </Button>
                  </div>
                </div>

                <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {conversationDetail.steps.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No steps yet</p>
                  ) : (
                    [...conversationDetail.steps]
                      .sort((a, b) => a.step_order - b.step_order)
                      .map((step) => {
                        const stepTriggers = conversationDetail.triggers.filter((t) => t.from_step_id === step.id);
                        return (
                          <div key={step.id} className="card-soft p-3">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                                {step.step_order}
                              </span>
                              <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{step.message_content}</p>
                              <div className="flex shrink-0 gap-0.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingStep(step)}>
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    if (confirm("Delete this step?")) {
                                      deleteStepMutation.mutate({ convId: conversationDetail.id, stepId: step.id! });
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            {formatDelay(step.delay_after_seconds) ? (
                              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Timer className="h-3 w-3" />
                                Wait {formatDelay(step.delay_after_seconds)} after this step
                              </p>
                            ) : null}

                            <div className="mt-2 border-t border-border/60 pt-2">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Triggers
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-[11px]"
                                  onClick={() => {
                                    setEditingTrigger({
                                      from_step_id: step.id!,
                                      to_step_id:
                                        conversationDetail.steps.find((s) => s.step_order > step.step_order)?.id ||
                                        step.id!,
                                      trigger_type: "keyword",
                                      trigger_value: [],
                                    });
                                  }}
                                >
                                  <Plus className="h-3 w-3" />
                                  Add
                                </Button>
                              </div>
                              {stepTriggers.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">No triggers</p>
                              ) : (
                                <div className="space-y-1">
                                  {stepTriggers.map((trigger) => {
                                    const toStep = conversationDetail.steps.find((s) => s.id === trigger.to_step_id);
                                    return (
                                      <div
                                        key={trigger.id}
                                        className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]"
                                      >
                                        <span className="min-w-0 flex-1 truncate">{triggerLabel(trigger)}</span>
                                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        <span className="shrink-0 tabular-nums text-muted-foreground">
                                          Step {toStep?.step_order ?? "?"}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                          onClick={() => {
                                            if (confirm("Delete this trigger?")) {
                                              deleteTriggerMutation.mutate({
                                                convId: conversationDetail.id,
                                                triggerId: trigger.id!,
                                              });
                                            }
                                          }}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
                <MessageSquare className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Conversation not found</p>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (open) setNewConvCountryCode(prefs.default_country_code);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,100%)] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>Create an automated message flow with steps and delays.</DialogDescription>
          </DialogHeader>

          <div className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <div>
                <p className="text-xs font-medium">Copy an existing flow</p>
                <p className="text-[11px] text-muted-foreground">Reuse steps from another conversation</p>
              </div>
              <Switch
                checked={useExistingConversation}
                onCheckedChange={(checked) => {
                  setUseExistingConversation(checked);
                  if (!checked) {
                    setSelectedConversationTemplateId("");
                    setCreateSteps([{ message_content: "", delay_after_seconds: 0, delay_unit: "seconds", step_order: 0 }]);
                  }
                }}
              />
            </div>

            {useExistingConversation ? (
              <Select
                value={selectedConversationTemplateId}
                onValueChange={async (val) => {
                  setSelectedConversationTemplateId(val);
                  if (!val) return;
                  try {
                    const templateConv = await api.conversations.get(parseInt(val, 10));
                    if (templateConv?.steps) {
                      setCreateSteps(
                        templateConv.steps.map((s: ConversationStep, idx: number) => ({
                          message_content: s.message_content,
                          delay_after_seconds: s.delay_after_seconds || 0,
                          delay_unit: "seconds" as const,
                          step_order: idx,
                        })),
                      );
                      setNewConvName(`${templateConv.name} (Copy)`);
                      setNewConvDescription(templateConv.description || "");
                      toast.success(`Loaded ${templateConv.steps.length} steps`);
                    }
                  } catch {
                    toast.error("Failed to load conversation template");
                  }
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose a flow to copy" />
                </SelectTrigger>
                <SelectContent className="z-[400]">
                  {conversations.map((conv) => (
                    <SelectItem key={conv.id} value={String(conv.id)}>
                      {conv.name}
                      <span className="ml-2 text-muted-foreground">{conv.step_count || 0} steps</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <div className="space-y-1">
              <label className={fieldLabel}>Name</label>
              <Input
                value={newConvName}
                onChange={(e) => setNewConvName(e.target.value)}
                placeholder="e.g. Order follow-up"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className={fieldLabel}>Description</label>
              <Textarea
                value={newConvDescription}
                onChange={(e) => setNewConvDescription(e.target.value)}
                placeholder="What this flow does"
                rows={2}
                className="min-h-[64px]"
              />
            </div>

            <div className="space-y-2">
              <label className={fieldLabel}>Target</label>
              <div className="flex rounded-md border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setNewConvTargetType("contact")}
                  className={cn(
                    "h-8 flex-1 rounded-md text-xs font-medium",
                    newConvTargetType === "contact" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <User className="mr-1 inline h-3.5 w-3.5" />
                  Contact
                </button>
                <button
                  type="button"
                  onClick={() => setNewConvTargetType("list")}
                  className={cn(
                    "h-8 flex-1 rounded-md text-xs font-medium",
                    newConvTargetType === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <Layers className="mr-1 inline h-3.5 w-3.5" />
                  List
                </button>
              </div>

              {newConvTargetType === "contact" ? (
                <div className="space-y-2">
                  <div className="flex rounded-md border bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUseExistingContact(false);
                        setSelectedContactId("");
                      }}
                      className={cn(
                        "h-8 flex-1 rounded-md text-xs font-medium",
                        !useExistingContact ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      New number
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseExistingContact(true);
                        setNewConvTargetPhone("");
                        setContactSearch("");
                      }}
                      className={cn(
                        "h-8 flex-1 rounded-md text-xs font-medium",
                        useExistingContact ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                      )}
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
                      <SelectContent className="z-[400]">
                        {contactsLoading ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading
                          </div>
                        ) : contacts.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">Add contacts first.</div>
                        ) : (
                          <>
                            <div className="sticky top-0 border-b bg-popover p-2">
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
                    <PhoneField
                      countryCode={newConvCountryCode}
                      nationalNumber={newConvTargetPhone}
                      onCountryCodeChange={setNewConvCountryCode}
                      onNationalNumberChange={setNewConvTargetPhone}
                    />
                  )}
                </div>
              ) : (
                <Select value={newConvTargetListId} onValueChange={setNewConvTargetListId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={lists.length === 0 ? "No lists" : "Choose a list"} />
                  </SelectTrigger>
                  <SelectContent className="z-[400]">
                    {lists.map((l: LeadList) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.title}
                        <span className="ml-2 text-muted-foreground">{l.count || 0}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className={fieldLabel}>Start date</label>
                <DateField
                  value={newConvScheduledTime ? newConvScheduledTime.split("T")[0] : ""}
                  onChange={(date) => {
                    const time = newConvScheduledTime.includes("T") ? newConvScheduledTime.split("T")[1] : "09:00";
                    setNewConvScheduledTime(date ? `${date}T${time}` : "");
                  }}
                  min={new Date().toISOString().split("T")[0]}
                  size="sm"
                  allowClear
                />
              </div>
              <div className="space-y-1">
                <label className={fieldLabel}>Start time</label>
                <TimeField
                  value={
                    newConvScheduledTime && newConvScheduledTime.includes("T")
                      ? newConvScheduledTime.split("T")[1]
                      : "09:00"
                  }
                  onChange={(time) => {
                    const date = newConvScheduledTime.split("T")[0] || new Date().toISOString().split("T")[0];
                    setNewConvScheduledTime(`${date}T${time}`);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Steps</h3>
                  <p className="text-[11px] text-muted-foreground">Messages sent in order</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    setCreateSteps([
                      ...createSteps,
                      {
                        message_content: "",
                        delay_after_seconds: 0,
                        delay_unit: "seconds",
                        step_order: createSteps.length,
                      },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {createSteps.map((step, index) => (
                <div key={index} className="card-soft space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">Step {index + 1}</span>
                    {createSteps.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setCreateSteps(createSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i })))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Textarea
                      value={step.message_content}
                      onChange={(e) => {
                        const updated = [...createSteps];
                        updated[index].message_content = e.target.value;
                        setCreateSteps(updated);
                      }}
                      placeholder="Message content"
                      rows={3}
                      className="min-h-[72px] resize-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Insert template"
                      onClick={() => {
                        setSelectedStepForTemplate(index);
                        setShowTemplateLibrary(true);
                      }}
                    >
                      <Library className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {index < createSteps.length - 1 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Then wait</span>
                      <Input
                        type="number"
                        min={0}
                        value={step.delay_after_seconds}
                        onChange={(e) => {
                          const updated = [...createSteps];
                          updated[index].delay_after_seconds = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setCreateSteps(updated);
                        }}
                        className="h-8 w-16 text-xs"
                      />
                      <Select
                        value={step.delay_unit || "seconds"}
                        onValueChange={(v: DelayUnit) => {
                          const updated = [...createSteps];
                          updated[index].delay_unit = v;
                          setCreateSteps(updated);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[7.5rem] text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[400]">
                          <SelectItem value="seconds">Seconds</SelectItem>
                          <SelectItem value="minutes">Minutes</SelectItem>
                          <SelectItem value="hours">Hours</SelectItem>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="months">Months</SelectItem>
                        </SelectContent>
                      </Select>
                      {step.delay_after_seconds > 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          ({formatDelay(delayToSeconds(step.delay_after_seconds, step.delay_unit || "seconds"))})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !newConvName ||
                (newConvTargetType === "contact" && !useExistingContact && !newConvTargetPhone) ||
                (newConvTargetType === "contact" && useExistingContact && !selectedContactId) ||
                (newConvTargetType === "list" && !newConvTargetListId) ||
                createSteps.filter((s) => s.message_content.trim()).length === 0
              }
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTemplateLibrary} onOpenChange={setShowTemplateLibrary}>
        <DialogContent className="flex max-h-[min(85dvh,100%)] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Insert template</DialogTitle>
            <DialogDescription>
              Choose a template for step {selectedStepForTemplate != null ? selectedStepForTemplate + 1 : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
                <Library className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No templates yet. Create some in Templates.</p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (selectedStepForTemplate == null) return;
                    const updated = [...createSteps];
                    updated[selectedStepForTemplate].message_content = t.body;
                    setCreateSteps(updated);
                    setShowTemplateLibrary(false);
                    setSelectedStepForTemplate(null);
                    toast.success(`Added “${t.title}”`);
                  }}
                  className="card-soft w-full p-3 text-left hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{t.title}</p>
                    {t.category ? <StatusPill label={t.category} tone="muted" /> : null}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{t.body}</p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingStep !== null} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStep?.id ? "Edit step" : "Add step"}</DialogTitle>
          </DialogHeader>
          {editingStep ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className={fieldLabel}>Message</label>
                <Textarea
                  value={editingStep.message_content}
                  onChange={(e) => setEditingStep({ ...editingStep, message_content: e.target.value })}
                  rows={5}
                />
              </div>
              <div className="space-y-1">
                <label className={fieldLabel}>Delay after this step (seconds)</label>
                <Input
                  type="number"
                  min={0}
                  className="h-9"
                  value={editingStep.delay_after_seconds || 0}
                  onChange={(e) =>
                    setEditingStep({ ...editingStep, delay_after_seconds: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingStep(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    if (editingStep.id) {
                      api.conversations.updateStep(selectedConversationId!, editingStep.id, editingStep).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
                        setEditingStep(null);
                        toast.success("Step updated");
                      });
                    } else {
                      addStepMutation.mutate({ convId: selectedConversationId!, step: editingStep });
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingTrigger !== null} onOpenChange={(open) => !open && setEditingTrigger(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTrigger?.id ? "Edit trigger" : "Add trigger"}</DialogTitle>
          </DialogHeader>
          {editingTrigger && conversationDetail ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className={fieldLabel}>When the reply</label>
                <Select
                  value={editingTrigger.trigger_type}
                  onValueChange={(v) =>
                    setEditingTrigger({ ...editingTrigger, trigger_type: v as ConversationTriggerType })
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[400]">
                    <SelectItem value="any">Is any message</SelectItem>
                    <SelectItem value="keyword">Matches keyword(s)</SelectItem>
                    <SelectItem value="exact">Is an exact match</SelectItem>
                    <SelectItem value="contains">Contains text</SelectItem>
                    <SelectItem value="regex">Matches regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingTrigger.trigger_type !== "any" ? (
                <div className="space-y-1">
                  <label className={fieldLabel}>
                    {editingTrigger.trigger_type === "keyword" ? "Keywords (comma-separated)" : "Value"}
                  </label>
                  <Input
                    className="h-9"
                    value={
                      Array.isArray(editingTrigger.trigger_value)
                        ? editingTrigger.trigger_value.join(", ")
                        : editingTrigger.trigger_value || ""
                    }
                    onChange={(e) => {
                      const val =
                        editingTrigger.trigger_type === "keyword"
                          ? e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : e.target.value;
                      setEditingTrigger({ ...editingTrigger, trigger_value: val });
                    }}
                    placeholder={editingTrigger.trigger_type === "keyword" ? "hello, hi, hey" : "Enter value"}
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <label className={fieldLabel}>Go to step</label>
                <Select
                  value={String(editingTrigger.to_step_id)}
                  onValueChange={(v) => setEditingTrigger({ ...editingTrigger, to_step_id: parseInt(v, 10) })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[400]">
                    {conversationDetail.steps.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        Step {s.step_order}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <label htmlFor="case-sensitive" className="text-xs">
                  Case sensitive
                </label>
                <Switch
                  id="case-sensitive"
                  checked={editingTrigger.is_case_sensitive || false}
                  onCheckedChange={(checked) => setEditingTrigger({ ...editingTrigger, is_case_sensitive: checked })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingTrigger(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    if (editingTrigger.id) {
                      api.conversations
                        .updateTrigger(selectedConversationId!, editingTrigger.id, editingTrigger)
                        .then(() => {
                          queryClient.invalidateQueries({ queryKey: ["conversation", selectedConversationId] });
                          setEditingTrigger(null);
                          toast.success("Trigger updated");
                        });
                    } else {
                      addTriggerMutation.mutate({ convId: selectedConversationId!, trigger: editingTrigger });
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
