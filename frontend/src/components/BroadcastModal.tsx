import { useRef, useState } from "react";
import { Send, MessageSquare, Users, Loader2, AlertTriangle, CheckCircle, Library, Edit3, Paperclip, FileText, FileImage, Mic, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Template } from "@/lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetList: { id: number; title: string; count: number } | null;
}

export function BroadcastModal({ isOpen, onClose, targetList }: BroadcastModalProps) {
  const queryClient = useQueryClient();
  const [messageMode, setMessageMode] = useState<"template" | "custom">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customMessage, setCustomMessage] = useState("");
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileAccept, setFileAccept] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ATTACHMENT_ACCEPT = {
    document: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt",
    image: "image/*",
    audio: "audio/*",
  } as const;

  // --- FETCH TEMPLATES FOR SELECTION ---
  const { data: templates = [], isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.getAll,
    enabled: isOpen,
  });

  const selectedTemplate = templates.find(t => t.id.toString() === selectedTemplateId);

  // --- BROADCAST MUTATION ---
  const broadcastMutation = useMutation({
    mutationFn: () => {
      if (!targetList) throw new Error("Missing target list");
      let messageBody = "";
      if (messageMode === "template") {
        if (!selectedTemplate) throw new Error("Please select a template");
        messageBody = selectedTemplate.body;
      } else {
        if (!customMessage.trim() && !attachment) throw new Error("Please enter a message or attach media");
        messageBody = customMessage.trim();
      }

      if (attachment) {
        return api.lists.broadcastMedia(targetList.id, messageBody, attachment);
      }

      if (!messageBody) throw new Error("Please enter a message");
      return api.lists.broadcast(targetList.id, messageBody);
    },
    onSuccess: () => {
      toast.success(`Broadcast Successful: Dispatched to ${targetList?.count} contacts.`);
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setCustomMessage("");
      setSelectedTemplateId("");
      setAttachment(null);
      onClose();
    },
    onError: (err: any) => {
      toast.error(`Transmission Error: ${err.message}`);
    },
    onSettled: () => setIsTransmitting(false)
  });

  const handleStartMission = () => {
    if (messageMode === "template" && !selectedTemplateId) {
      return toast.error("Please select a template first.");
    }
    if (messageMode === "custom" && !customMessage.trim() && !attachment) {
      return toast.error("Please enter a message or attach media.");
    }
    setIsTransmitting(true);
    broadcastMutation.mutate();
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id.toString() === templateId);
    if (template) {
      setCustomMessage(template.body);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="p-8 border-b border-border/50 bg-indigo-500/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 glow-indigo">
              <Send className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Broadcast Mission</DialogTitle>
              <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Target List: <span className="text-indigo-400">{targetList?.title}</span> ({targetList?.count} Leads)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-6">
          {/* MESSAGE MODE SELECTOR */}
          <Tabs value={messageMode} onValueChange={(v) => setMessageMode(v as "template" | "custom")}>
            <TabsList className="grid w-full grid-cols-2 bg-secondary/30 rounded-xl p-1 h-12">
              <TabsTrigger 
                value="template" 
                className={cn(
                  "rounded-lg text-xs font-semibold transition-all flex items-center gap-2",
                  messageMode === "template" 
                    ? "bg-indigo-500 text-white shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Library className="w-4 h-4" />
                Use Template
              </TabsTrigger>
              <TabsTrigger 
                value="custom"
                className={cn(
                  "rounded-lg text-xs font-semibold transition-all flex items-center gap-2",
                  messageMode === "custom"
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Edit3 className="w-4 h-4" />
                Write Message
              </TabsTrigger>
            </TabsList>

            {/* TEMPLATE MODE */}
            <TabsContent value="template" className="space-y-4 mt-4">
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-2">
                  <Library className="w-3.5 h-3.5 text-indigo-400" /> Select Template
                </label>
                <Select onValueChange={handleTemplateSelect} value={selectedTemplateId}>
                  <SelectTrigger className="h-12 bg-secondary/30 rounded-xl border-border text-sm font-medium">
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent 
                    className="!z-[400] bg-popover border-border shadow-lg" 
                    position="popper"
                    sideOffset={4}
                    style={{ zIndex: 400 }}
                  >
                    {templatesLoading ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground text-center flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading templates...
                      </div>
                    ) : templatesError ? (
                      <div className="px-4 py-3 text-sm text-destructive text-center">
                        Error loading templates
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                        No templates available. Create templates in the Templates section.
                      </div>
                    ) : (
                      templates.map((t: Template) => (
                        <SelectItem 
                          key={t.id} 
                          value={t.id.toString()} 
                          className="font-medium text-sm cursor-pointer hover:bg-accent focus:bg-accent"
                        >
                          {t.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* TEMPLATE PREVIEW */}
              {selectedTemplate && (
                <div className="p-4 bg-secondary/20 border border-border/50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span className="text-[9px] font-semibold uppercase text-muted-foreground">Preview</span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {selectedTemplate.body}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* CUSTOM MESSAGE MODE */}
            <TabsContent value="custom" className="space-y-4 mt-4">
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-400" /> Write Your Message
                </label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Type your message here..."
                  className="min-h-[200px] bg-background border-border rounded-xl p-4 text-sm resize-none font-normal leading-relaxed"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{customMessage.length} characters</span>
                  {selectedTemplate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCustomMessage(selectedTemplate.body);
                        setMessageMode("custom");
                      }}
                      className="h-7 text-[10px]"
                    >
                      Use selected template
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* WARNING BLOCK */}
          <div className="p-4 bg-amber/5 border border-amber/20 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber mt-0.5 shrink-0" />
            <p className="text-[9px] font-bold text-amber uppercase leading-relaxed">
              Caution: This will trigger {targetList?.count} individual WhatsApp transmissions. Ensure your WAHA session is stable.
            </p>
          </div>
        </div>

        <DialogFooter className="bg-secondary/10 p-6 border-t border-border/50 flex flex-col gap-3">
          {attachment && (
            <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/30 border border-border/60 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {attachment.type.startsWith("image/") ? (
                  <FileImage className="w-4 h-4 text-indigo-500" />
                ) : attachment.type.startsWith("audio/") ? (
                  <Mic className="w-4 h-4 text-emerald-500" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="truncate max-w-[220px]">{attachment.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="ml-2 rounded-full p-1 hover:bg-muted text-muted-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="w-full flex items-center gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isTransmitting} className="h-12 px-8 font-black uppercase text-[10px] rounded-xl">
              Abort
            </Button>

            <div className="flex-1 flex items-center gap-3 justify-end">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={fileAccept}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttachment(f);
                  if (e.target) e.target.value = "";
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl border-dashed border-indigo-400 text-indigo-500 hover:bg-indigo-500/10"
                    title="Attach document, image, or audio"
                    disabled={isTransmitting}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="min-w-[10rem] z-[400]"
                  style={{ zIndex: 400 }}
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setFileAccept(ATTACHMENT_ACCEPT.document);
                      setTimeout(() => fileInputRef.current?.click(), 0);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Document
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setFileAccept(ATTACHMENT_ACCEPT.image);
                      setTimeout(() => fileInputRef.current?.click(), 0);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <FileImage className="w-4 h-4" />
                    Image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setFileAccept(ATTACHMENT_ACCEPT.audio);
                      setTimeout(() => fileInputRef.current?.click(), 0);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    Audio
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button 
                onClick={handleStartMission} 
                disabled={
                  isTransmitting ||
                  (messageMode === "template" && !selectedTemplateId) ||
                  (messageMode === "custom" && !customMessage.trim() && !attachment)
                }
                className="h-12 flex-1 bg-indigo-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all"
              >
                {isTransmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Send to {targetList?.count} Contacts</>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}