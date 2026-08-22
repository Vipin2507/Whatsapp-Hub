import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, Loader2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

/**
 * TYPEWRITER COMPONENT
 * Renders text character-by-character for a more interactive AI feel.
 */
function Typewriter({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let i = 0;
    setDisplayedText("");
    const timer = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(i));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return <span>{displayedText}</span>;
}

const OPEN_HELPBOT_EVENT = "buildesk:open-helpbot";

export function HelpBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Systems online. I am the Buildesk Navigator. How can I assist your operations today?" }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open from sidebar "Help Center"
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener(OPEN_HELPBOT_EVENT, handler);
    return () => window.removeEventListener(OPEN_HELPBOT_EVENT, handler);
  }, []);

  // Auto-scroll logic for new transmissions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput("");
    setIsTyping(true);

    try {
      // Backend Proxy Call (Auth-Secured)
      const data = await api.helpbot.chat(currentInput);

      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.output || "Transmission received, but data packet was empty."
      }]);
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: "Communication Link Failure: Secure Proxy unreachable. Please verify server status."
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed z-[9999] bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]">
      {isOpen && (
        <div className="absolute bottom-16 right-0 flex h-[min(32rem,calc(100dvh-6rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border bg-card shadow-elevated sm:w-96">

          {/* HEADER: Tactics & Branding */}
          <div className="p-6 bg-gradient-to-r from-primary via-primary/95 to-primary text-primary-foreground flex items-center justify-between shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/20 backdrop-blur-md shadow-lg">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">Navigator AI</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  <p className="text-[9px] font-semibold opacity-90 uppercase tracking-tight">Logic Link Active</p>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-lg hover:bg-white/20 text-white relative z-10 transition-all duration-200">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* MESSAGE FEED: Scrollable Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-5 bg-gradient-to-b from-background to-secondary/5 scrollbar-thin">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex animate-in fade-in slide-in-from-bottom-2 duration-300", m.role === 'user' ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] p-4 rounded-2xl text-[11px] font-medium leading-relaxed shadow-lg transition-all duration-200 hover:scale-[1.02]",
                  m.role === 'user'
                    ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-sm shadow-primary/20"
                    : "bg-gradient-to-br from-card/80 to-card/60 border border-border/50 text-foreground rounded-tl-sm shadow-sm",
                  "whitespace-pre-wrap"
                )}>
                  {/* Apply Typewriter only to the latest bot response */}
                  {m.role === 'bot' && i === messages.length - 1 ? (
                    <Typewriter text={m.text} />
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}

            {/* Thinking Indicator */}
            {isTyping && (
              <div className="flex justify-start animate-in fade-in slide-in-from-left-2">
                <div className="bg-card border border-border p-4 rounded-2xl rounded-tl-none flex items-center gap-3 shadow-sm">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Analyzing...</span>
                </div>
              </div>
            )}
          </div>

          {/* INPUT UNIT: Tactical Entry */}
          <div className="p-5 border-t border-border/50 bg-gradient-to-r from-card/70 via-card/60 to-card/70 backdrop-blur-xl flex gap-2 items-center shadow-lg">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Query Matrix Navigator..."
              className="rounded-xl bg-gradient-to-r from-background to-secondary/20 border-border/50 h-12 text-xs focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 font-medium shadow-sm hover:shadow-md transition-all"
              disabled={isTyping}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isTyping || !input.trim()}
              size="icon"
              className="rounded-xl shrink-0 h-12 w-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/30 transition-all duration-200 active:scale-95 hover:shadow-xl hover:shadow-primary/40"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 2. MAIN FLOATING TRIGGER */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
          className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border-2 border-background shadow-elevated transition-all duration-300 sm:h-14 sm:w-14",
          isOpen
            ? "bg-gradient-to-br from-secondary to-secondary/80 rotate-90 scale-90"
            : "bg-gradient-to-br from-primary to-primary/90 hover:from-primary/90 hover:to-primary hover:scale-110 hover:shadow-primary/50 active:scale-95"
        )}
      >
        {isOpen ? (
          <X className="w-7 h-7 text-foreground" />
        ) : (
          <div className="relative">
            <Sparkles className="w-7 h-7 text-primary-foreground group-hover:animate-pulse" />
            {/* Small notification dot to draw attention */}
            {!isOpen && messages.length === 1 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-background animate-bounce" />
            )}
          </div>
        )}
      </Button>

      {/* Internal Custom Scrollbar Styles */}
      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { 
          background: hsl(var(--border)); 
          border-radius: 10px; 
        }
      `}</style>
    </div>
  );
}