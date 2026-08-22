import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { StatusPill } from "@/components/PendingChip";
import { useAppPreferences } from "@/hooks/use-app-settings";

const OPEN_HELPBOT_EVENT = "buildesk:open-helpbot";

const WELCOME =
  "Ask about inbox, contacts, lists, templates, scheduler, sessions, or team. I can walk you through how this workspace works.";

const SUGGESTIONS = [
  "How do I schedule a message?",
  "How do I add contacts?",
  "What does auto-reply do?",
  "How do I assign a WhatsApp session?",
];

type ChatRole = "bot" | "user";
type ChatMessage = { role: ChatRole; text: string };

export function HelpBot() {
  const prefs = useAppPreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "bot", text: WELCOME }]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener(OPEN_HELPBOT_EVENT, handler);
    return () => window.removeEventListener(OPEN_HELPBOT_EVENT, handler);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isTyping]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [input, isOpen]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setIsTyping(true);

    try {
      const data = (await api.helpbot.chat(trimmed)) as { output?: string };
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: data.output || "I didn't get a reply. Try asking another way." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Help is unavailable right now. Check that the backend is running, then try again." },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const resetChat = () => {
    setMessages([{ role: "bot", text: WELCOME }]);
    setInput("");
  };

  const showSuggestions = messages.length === 1 && !isTyping;

  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-[140]">
      {isOpen ? (
        <div className="absolute bottom-14 right-0 flex h-[min(28rem,calc(100dvh-5.5rem))] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-lg border bg-card shadow-elevated sm:bottom-16">
          <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">Help</p>
              <StatusPill label={isTyping ? "Thinking" : "Ready"} tone={isTyping ? "warning" : "success"} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={resetChat}
              title="New conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setIsOpen(false)}
              aria-label="Close help"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] px-2.5 py-1.5 text-[13px] leading-relaxed",
                      m.role === "user" ? "message-mine rounded-2xl rounded-br-md" : "message-customer rounded-2xl rounded-bl-md",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                </div>
              ))}

              {showSuggestions ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTIONS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="rounded-md border bg-background px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              {isTyping ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Thinking
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="shrink-0 border-t bg-card/80 p-2">
            <div className="flex items-end gap-1.5">
              <div className="flex min-h-9 min-w-0 flex-1 items-end rounded-md border bg-background px-2.5 py-1.5">
                <textarea
                  ref={textareaRef}
                  value={input}
                  rows={1}
                  disabled={isTyping}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && prefs.enter_to_send) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Ask a question"
                  className="max-h-24 w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => send(input)}
                disabled={isTyping || !input.trim()}
                title="Send"
              >
                {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </footer>
        </div>
      ) : null}

      <Button
        size="icon"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "h-11 w-11 rounded-full shadow-elevated",
          isOpen ? "bg-muted text-foreground hover:bg-muted" : "",
        )}
        aria-label={isOpen ? "Close help" : "Open help"}
      >
        {isOpen ? <X className="h-4 w-4" /> : <LifeBuoy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
