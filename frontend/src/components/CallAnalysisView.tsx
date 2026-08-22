import { useState } from "react";
import {
  ChevronLeft, Loader2, Upload, FileText, MessageSquare,
  X, CheckCircle2, ListChecks, ArrowRight, Calendar,
  Sparkles, AlertCircle, Mic, Link2, Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, CallReport, CallReportSummary } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CallAnalysisViewProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, render inside main layout (no full-screen overlay) so sidebar stays visible */
  embedded?: boolean;
}

export function CallAnalysisView({ isOpen, onClose, embedded = false }: CallAnalysisViewProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [inputMode, setInputMode] = useState<"upload" | "url">("upload");
  const [audioUrl, setAudioUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const { data: reports = [], isLoading, isError, error: reportsError } = useQuery({
    queryKey: ["call-analysis-reports"],
    queryFn: api.callAnalysis.getReports,
    enabled: isOpen,
  });

  const { data: reportDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["call-analysis-report", selectedReportId],
    queryFn: () => api.callAnalysis.getReport(selectedReportId!),
    enabled: isOpen && selectedReportId != null,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("title", title.trim() || "Call");
      if (inputMode === "url") {
        const url = audioUrl.trim();
        if (!url) throw new Error("Please enter an audio URL");
        formData.append("mp3_url", url);
      } else {
        if (!selectedFile) throw new Error("Please select an audio file");
        if (selectedFile.size > 100 * 1024 * 1024) {
          throw new Error("File too large. Maximum size is 100MB.");
        }
        formData.append("audio_file", selectedFile);
      }
      return api.callAnalysis.analyzeWithAudio(formData);
    },
    onSuccess: (data: { report: CallReport }) => {
      queryClient.invalidateQueries({ queryKey: ["call-analysis-reports"] });
      setTitle("");
      setAudioUrl("");
      setSelectedFile(null);
      setSelectedReportId(data.report.id);
      toast.success("Call analyzed");
    },
    onError: (e: Error) => {
      console.error("Analysis error:", e);
      toast.error(e.message || "Analysis failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.callAnalysis.deleteReport(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["call-analysis-reports"] });
      queryClient.removeQueries({ queryKey: ["call-analysis-report", id] });
      if (selectedReportId === id) setSelectedReportId(null);
      toast.success("Report deleted");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Delete failed");
    },
  });

  const requestDeleteReport = (id: number) => {
    if (deleteMutation.isPending) return;
    if (window.confirm("Delete this call analysis report? This cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={embedded ? "flex-1 flex flex-col min-h-0 overflow-hidden bg-background" : "fixed inset-0 z-[100] flex flex-col bg-background"}>
      <header className="app-overlay-header">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          <div className="hidden h-8 w-px bg-border/50 sm:block" />
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
              <Mic className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight sm:text-lg">Call Analysis</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Upload audio, get AI summary and next actions</p>
            </div>
          </div>
        </div>
      </header>

      <div className="app-split">
        <aside className="app-split-side max-h-[46dvh] lg:max-h-none">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" /> New analysis
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Title (optional)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sales call with John"
                className="rounded-xl bg-background"
              />
            </div>
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "upload" | "url")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50">
                <TabsTrigger value="upload" className="rounded-lg gap-2">
                  <Upload className="w-3.5 h-3.5" /> Upload
                </TabsTrigger>
                <TabsTrigger value="url" className="rounded-lg gap-2">
                  <Link2 className="w-3.5 h-3.5" /> URL
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="mt-3 space-y-2">
                <label className="text-sm font-medium text-foreground block">Audio file</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".wav,audio/*,.mp3,.m4a,.ogg,.flac,.aac,.opus"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="rounded-xl bg-background file:mr-2 file:rounded-lg file:border-0 file:bg-violet-500/10 file:px-3 file:py-1.5 file:text-sm file:text-violet-600"
                  />
                  {selectedFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                      className="shrink-0 text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground truncate">{selectedFile.name}</p>
                )}
              </TabsContent>
              <TabsContent value="url" className="mt-3 space-y-2">
                <label className="text-sm font-medium text-foreground block">Audio URL</label>
                <Input
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://example.com/recording.mp3"
                  className="rounded-xl bg-background"
                />
              </TabsContent>
            </Tabs>
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={
                analyzeMutation.isPending ||
                (inputMode === "upload" ? !selectedFile : !audioUrl.trim())
              }
              className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Transcribing & analyzing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Analyze with AI
                </>
              )}
            </Button>
          </div>
          <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border/50">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload a call recording (WAV, MP3, M4A, etc.). AI will transcribe it, then summarize, detect sentiment, extract key points, and suggest next actions.
              </p>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-border/50 p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-foreground">Reports</h3>
            <p className="text-xs text-muted-foreground">{reports.length} report{reports.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            <div className="max-h-[35dvh] w-full shrink-0 overflow-y-auto border-b border-border/50 md:max-h-none md:w-64 md:border-b-0 md:border-r lg:w-72">
              {isLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : isError && reportsError ? (
                <div className="p-6 text-center text-sm text-destructive">
                  <p className="font-medium">Failed to load reports</p>
                  <p className="mt-1 text-muted-foreground">{reportsError.message}</p>
                </div>
              ) : reports.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No reports yet. Upload an audio file and click Analyze.</div>
              ) : (
                <ul className="p-2 space-y-1">
                  {reports.map((r) => (
                    <li key={r.id} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedReportId(r.id)}
                        className={cn(
                          "flex-1 min-w-0 text-left p-3 rounded-xl transition-colors",
                          selectedReportId === r.id
                            ? "bg-violet-500/15 border border-violet-500/30 text-foreground"
                            : "hover:bg-muted/50 border border-transparent"
                        )}
                      >
                        <p className="text-sm font-medium truncate">{r.title || "Call"}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{r.summary || "—"}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-auto rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteReport(r.id);
                        }}
                        disabled={deleteMutation.isPending}
                        aria-label="Delete report"
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
              {selectedReportId == null ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Select a report or upload a new audio file
                </div>
              ) : detailLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              ) : reportDetail ? (
                <div className="max-w-2xl space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">{reportDetail.title || "Call"}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {reportDetail.created_at
                          ? new Date(reportDetail.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                          : "—"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      disabled={deleteMutation.isPending}
                      onClick={() => requestDeleteReport(reportDetail.id)}
                      aria-label="Delete report"
                    >
                      {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                  {reportDetail.summary && (
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-violet-500" /> Summary
                      </h3>
                      <div className="text-sm text-foreground leading-relaxed">
                        {reportDetail.summary.includes("\n") || reportDetail.summary.includes("•") || reportDetail.summary.includes("-") ? (
                          <ul className="space-y-1.5 list-none">
                            {reportDetail.summary
                              .split(/\n+/)
                              .filter(line => line.trim())
                              .map((line, i) => {
                                const trimmed = line.trim();
                                // Handle bullet points that already have • or - or *
                                const bulletMatch = trimmed.match(/^[•\-\*]\s*(.+)$/);
                                const content = bulletMatch ? bulletMatch[1] : trimmed;
                                return (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-violet-500 mt-0.5">•</span>
                                    <span className="flex-1">{content}</span>
                                  </li>
                                );
                              })}
                          </ul>
                        ) : (
                          <p>{reportDetail.summary}</p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {reportDetail.sentiment && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Sentiment:</span>
                        <span className="px-2 py-1 rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300 text-sm font-medium">
                          {reportDetail.sentiment}
                        </span>
                      </div>
                    )}
                    {(reportDetail.score !== undefined && reportDetail.score !== null && reportDetail.score !== "") && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Score:</span>
                        <span className="px-2 py-1 rounded-lg bg-muted text-foreground text-sm font-medium">
                          {String(reportDetail.score)}/10
                        </span>
                      </div>
                    )}
                  </div>
                  {reportDetail.key_points && (
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                        <ListChecks className="w-4 h-4 text-violet-500" /> Key points
                      </h3>
                      <ul className="text-sm text-foreground leading-relaxed space-y-1 list-disc list-inside">
                        {(reportDetail.key_points.split("\n").filter(Boolean).length
                          ? reportDetail.key_points.split("\n").filter(Boolean)
                          : [reportDetail.key_points]
                        ).map((line, i) => (
                          <li key={i}>{line.trim()}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {reportDetail.next_action && (
                    <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                        <ArrowRight className="w-4 h-4 text-violet-500" /> Next action
                      </h3>
                      <p className="text-sm text-foreground leading-relaxed">{reportDetail.next_action}</p>
                    </div>
                  )}
                  <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-muted-foreground" /> Transcript
                    </h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                      {reportDetail.transcript}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
