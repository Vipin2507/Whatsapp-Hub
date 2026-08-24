import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import {
  Send,
  Paperclip,
  MoreVertical,
  Phone,
  Sparkles,
  LayoutTemplate,
  Loader2,
  MessageSquare,
  ChevronLeft,
  X,
  FileImage,
  FileText,
  FileVideo,
  Mic,
  CheckCheck,
  Copy,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { api, Message } from "@/lib/api";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EASE, hoverLift, tapScale } from "@/lib/motion";
import { StatusPill } from "@/components/PendingChip";
import { useAppPreferences } from "@/hooks/use-app-settings";

const ATTACHMENT_ACCEPT = {
  document: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv",
  image: "image/*",
  audio: "audio/*",
} as const;

const GROUP_MS = 5 * 60 * 1000;

function isMediaPlaceholder(text?: string) {
  const value = (text || "").trim().toLowerCase();
  if (!value) return true;
  return (
    ["photo", "video", "voice message", "sticker", "attachment"].includes(value) ||
    value.startsWith("🖼️") ||
    value.startsWith("🎤") ||
    value.startsWith("📎")
  );
}

function ChatMedia({ msg, fromMe }: { msg: Message; fromMe: boolean }) {
  if (!msg.media_url || !msg.media_kind) return null;
  const src = msg.media_url.startsWith("http") ? msg.media_url : msg.media_url;
  if (msg.media_kind === "image" || msg.media_kind === "sticker") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="-mx-0.5 mb-1 block">
        <img
          src={src}
          alt={msg.media_name || "Image"}
          className="max-h-72 max-w-full rounded-lg object-cover"
        />
      </a>
    );
  }
  if (msg.media_kind === "video") {
    return <video src={src} controls className="mb-1 max-h-72 w-full rounded-lg" />;
  }
  if (msg.media_kind === "audio") {
    return <audio src={src} controls className="mb-1 w-full min-w-[180px] max-w-[240px]" />;
  }
  return (
    <a
      href={src}
      download={msg.media_name || undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium",
        fromMe ? "bg-white/15" : "bg-muted/70",
      )}
    >
      {msg.media_mime?.includes("video") ? (
        <FileVideo className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 truncate">{msg.media_name || "Document"}</span>
    </a>
  );
}

interface ChatInterfaceProps {
  activeContact: string | null;
  onOpenTemplates: () => void;
  onBack?: () => void;
  onCloseChat?: () => void;
  templateBody?: string;
  onTemplateConsumed?: () => void;
}

export function ChatInterface({
  activeContact,
  onOpenTemplates,
  onBack,
  onCloseChat,
  templateBody,
  onTemplateConsumed,
}: ChatInterfaceProps) {
  const handleClose = onCloseChat ?? onBack;
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const pinnedContactRef = useRef<string | null>(null);
  const [fileAccept, setFileAccept] = useState<string>(ATTACHMENT_ACCEPT.document);
  const queryClient = useQueryClient();
  const prefs = useAppPreferences();

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.getAll,
  });

  const contactDetails = useMemo(
    () => contacts.find((c) => c.phone === activeContact),
    [contacts, activeContact],
  );

  const displayName = contactDetails?.name || activeContact;

  useEffect(() => {
    if (templateBody) {
      setMessage(templateBody);
      onTemplateConsumed?.();
      toast.success("Template added");
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [templateBody, onTemplateConsumed]);

  useEffect(() => {
    setMessage("");
    setAttachment(null);
  }, [activeContact]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", activeContact],
    queryFn: () => api.chat.getMessages(activeContact!),
    enabled: !!activeContact,
    refetchInterval: 3000,
  });

  const aiAssistMutation = useMutation({
    mutationFn: async () => {
      const lastIncoming = [...messages].reverse().find((m) => !m.is_from_me);
      const prompt = lastIncoming
        ? `Draft a professional WhatsApp reply to this: "${lastIncoming.content}"`
        : "Suggest a friendly greeting to re-engage a property lead.";
      return api.helpbot.assist(prompt);
    },
    onSuccess: (data: { output?: string }) => {
      setMessage(typeof data?.output === "string" ? data.output : "");
      toast.success("Draft ready");
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ to, msg }: { to: string; msg: string }) => api.chat.sendMessage(to, msg),
    onSuccess: () => {
      setMessage("");
      setAttachment(null);
      queryClient.invalidateQueries({ queryKey: ["messages", activeContact] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: () => toast.error("Could not send. Check WhatsApp connection."),
  });

  const sendMediaMutation = useMutation({
    mutationFn: async ({ to, caption, file }: { to: string; caption: string; file: File }) => {
      const res = await api.chat.sendMedia(to, caption, file);
      return res as { status?: string; message?: Message };
    },
    onSuccess: (data, variables) => {
      setMessage("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const msg = data?.message;
      const contact = variables.to;
      if (msg && contact) {
        queryClient.setQueryData<Message[]>(
          ["messages", contact],
          (old) => (old ? [...old, msg] : [msg]),
        );
      }
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["messages", contact] });
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      }, 400);
      toast.success("Attachment sent");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to send attachment"),
  });

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    const end = bottomRef.current;
    if (!el) return;
    if (end) {
      const delta = end.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
      if (Math.abs(delta) > 1) el.scrollTop += delta;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    pinnedContactRef.current = null;
  }, [activeContact]);

  useLayoutEffect(() => {
    if (!activeContact || !stickToBottomRef.current) return;
    scrollToLatest();
    if (messages.length > 0) pinnedContactRef.current = activeContact;
  }, [activeContact, messages, isLoading, scrollToLatest]);

  useEffect(() => {
    if (!activeContact || !stickToBottomRef.current) return;
    const timers = [0, 50, 160, 320].map((ms) => window.setTimeout(scrollToLatest, ms));
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(scrollToLatest);
    });
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(frame);
    };
  }, [activeContact, messages, isLoading, scrollToLatest]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (pinnedContactRef.current !== activeContact) return;
      const end = bottomRef.current;
      if (!end) {
        stickToBottomRef.current = true;
        return;
      }
      const distance = Math.abs(end.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom);
      stickToBottomRef.current = distance < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeContact]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const keepLatest = () => {
      if (stickToBottomRef.current) scrollToLatest();
    };
    const observer = new ResizeObserver(keepLatest);
    observer.observe(el);
    const inner = el.firstElementChild;
    if (inner) observer.observe(inner);
    const media = el.querySelectorAll("img, video");
    media.forEach((node) => {
      node.addEventListener("load", keepLatest);
      node.addEventListener("loadeddata", keepLatest);
    });
    return () => {
      observer.disconnect();
      media.forEach((node) => {
        node.removeEventListener("load", keepLatest);
        node.removeEventListener("loadeddata", keepLatest);
      });
    };
  }, [messages, activeContact, scrollToLatest]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [message]);

  const formatLocalTime = (isoString: string) => {
    if (!isoString) return "--:--";
    try {
      return new Date(isoString).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "00:00";
    }
  };

  const getDayKey = (isoString: string) => {
    if (!isoString) return "unknown";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "unknown";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const formatDayLabel = (isoString: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfThatDay) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  const interpolateMessage = (msg: string, contactPhone: string): string => {
    const contact = contacts.find((c) => c.phone === contactPhone);
    if (!contact) return msg;
    return msg.replace(/\{\{name\}\}/g, contact.name || contactPhone);
  };

  const handleSend = () => {
    if (!activeContact) return;
    const isPending = sendMessageMutation.isPending || sendMediaMutation.isPending;
    const interpolatedMessage = interpolateMessage(message, activeContact);

    if (attachment) {
      if (isPending) return;
      sendMediaMutation.mutate({ to: activeContact, caption: interpolatedMessage, file: attachment });
      return;
    }
    if (!message.trim() || isPending) return;
    sendMessageMutation.mutate({ to: activeContact, msg: interpolatedMessage });
  };

  const copyNumber = async () => {
    if (!activeContact) return;
    await navigator.clipboard.writeText(activeContact);
    toast.success("Number copied");
  };

  const canSend = Boolean(message.trim() || attachment);
  const isSending = sendMessageMutation.isPending || sendMediaMutation.isPending;
  const stageTone =
    contactDetails?.stage?.toLowerCase() === "hot"
      ? "warning"
      : contactDetails?.stage?.toLowerCase() === "closed"
        ? "success"
        : contactDetails?.stage?.toLowerCase() === "follow-up"
          ? "info"
          : "muted";

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-background">
      <AnimatePresence mode="wait">
        {!activeContact ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex flex-1 flex-col items-center justify-center px-6 text-center"
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold tracking-tight">Select a conversation</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Choose a contact from the list to read and send WhatsApp messages.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={activeContact}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <header className="flex h-14 shrink-0 items-center gap-1.5 border-b bg-card/80 px-2 backdrop-blur sm:px-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 shrink-0"
                title="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {(displayName ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-sm font-semibold tracking-tight">{displayName}</h3>
                  {contactDetails?.stage ? (
                    <StatusPill label={contactDetails.stage} tone={stageTone} className="hidden sm:inline-flex" />
                  ) : null}
                </div>
                <p className="truncate text-[11px] tabular-nums text-muted-foreground">{activeContact}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Call" asChild>
                <a href={`tel:${activeContact}`}>
                  <Phone className="h-4 w-4" />
                </a>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={copyNumber}>
                    <Copy className="h-3.5 w-3.5" />
                    Copy number
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={onOpenTemplates}>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    Templates
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <div className="relative min-h-0 flex-1">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(hsl(var(--primary) / 0.07) 0.8px, transparent 0.8px)",
                  backgroundSize: "14px 14px",
                }}
              />
              <div
                ref={scrollRef}
                className="chat-scroll absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-5"
                style={{ overflowAnchor: "none" }}
              >
              <div className="relative flex min-h-full flex-col justify-end space-y-0.5">
                {isLoading && messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 pt-16">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-[11px] text-muted-foreground">Loading messages</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1 pt-16 text-center">
                    <p className="text-xs text-muted-foreground">No messages yet</p>
                    <p className="text-[11px] text-muted-foreground">Send the first one below.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const prev = index > 0 ? messages[index - 1] : null;
                    const next = index < messages.length - 1 ? messages[index + 1] : null;
                    const dayKey = getDayKey(msg.time);
                    const prevDayKey = prev ? getDayKey(prev.time) : null;
                    const showDay = index === 0 || (dayKey !== "unknown" && dayKey !== prevDayKey);
                    const prevSame =
                      prev &&
                      prev.is_from_me === msg.is_from_me &&
                      Math.abs(new Date(msg.time).getTime() - new Date(prev.time).getTime()) < GROUP_MS &&
                      !showDay;
                    const nextSame =
                      next &&
                      next.is_from_me === msg.is_from_me &&
                      getDayKey(next.time) === dayKey &&
                      Math.abs(new Date(next.time).getTime() - new Date(msg.time).getTime()) < GROUP_MS;
                    const isLastInGroup = !nextSame;
                    const fromMe = msg.is_from_me;

                    return (
                      <div key={`${msg.time}-${index}`}>
                        {showDay && (
                          <div className="flex justify-center py-2.5">
                            <span className="rounded-full border bg-card/90 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-soft">
                              {formatDayLabel(msg.time)}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn("flex", fromMe ? "justify-end" : "justify-start", prevSame ? "mt-0.5" : "mt-2")}
                        >
                          <div
                            className={cn(
                              "max-w-[82%] px-2.5 py-1.5 text-[13px] leading-relaxed sm:max-w-[68%]",
                              fromMe
                                ? "message-mine shadow-soft"
                                : "message-customer shadow-soft",
                              fromMe
                                ? isLastInGroup
                                  ? "rounded-2xl rounded-br-md"
                                  : "rounded-2xl rounded-r-md"
                                : isLastInGroup
                                  ? "rounded-2xl rounded-bl-md"
                                  : "rounded-2xl rounded-l-md",
                            )}
                          >
                            <ChatMedia msg={msg} fromMe={fromMe} />
                            {msg.content?.trim() && !isMediaPlaceholder(msg.content) ? (
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            ) : !msg.media_url ? (
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            ) : null}
                            <span
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-0.5 text-[10px] tabular-nums",
                                fromMe ? "text-primary-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              {formatLocalTime(msg.time)}
                              {fromMe ? <CheckCheck className="h-3 w-3" /> : null}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} className="h-px w-full shrink-0" />
              </div>
              </div>
            </div>

            <footer className="shrink-0 border-t bg-card/80 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:px-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenTemplates}
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Templates
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => aiAssistMutation.mutate()}
                  disabled={aiAssistMutation.isPending || messages.length === 0}
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                >
                  {aiAssistMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Draft
                </Button>
              </div>

              <AnimatePresence>
                {attachment && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18, ease: EASE }}
                    className="mb-1.5 flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5"
                  >
                    {attachment.type.startsWith("image/") ? (
                      <FileImage className="h-4 w-4 shrink-0 text-primary" />
                    ) : attachment.type.startsWith("audio/") ? (
                      <Mic className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{attachment.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-1.5 pr-14 sm:pr-16">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={fileAccept}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setAttachment(f);
                    e.target.value = "";
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground"
                      title="Attach"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="min-w-[10rem]">
                    <DropdownMenuItem
                      className="cursor-pointer gap-2"
                      onClick={() => {
                        setFileAccept(ATTACHMENT_ACCEPT.document);
                        setTimeout(() => fileInputRef.current?.click(), 0);
                      }}
                    >
                      <FileText className="h-4 w-4" />
                      Document
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2"
                      onClick={() => {
                        setFileAccept(ATTACHMENT_ACCEPT.image);
                        setTimeout(() => fileInputRef.current?.click(), 0);
                      }}
                    >
                      <FileImage className="h-4 w-4" />
                      Image
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2"
                      onClick={() => {
                        setFileAccept(ATTACHMENT_ACCEPT.audio);
                        setTimeout(() => fileInputRef.current?.click(), 0);
                      }}
                    >
                      <Mic className="h-4 w-4" />
                      Audio
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex min-h-9 min-w-0 flex-1 items-end rounded-2xl border border-input bg-card px-3 py-1.5 dark:bg-muted/40">
                  <textarea
                    ref={textareaRef}
                    value={message}
                    rows={1}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !isSending && prefs.enter_to_send) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={attachment ? "Add a caption…" : "Type a message"}
                    className="max-h-[120px] w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <motion.div whileHover={canSend ? hoverLift : undefined} whileTap={canSend ? tapScale : undefined}>
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full"
                    onClick={handleSend}
                    disabled={isSending || !canSend}
                    title="Send"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </motion.div>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
