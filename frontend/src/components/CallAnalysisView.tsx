import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  Upload,
  FileText,
  X,
  ListChecks,
  ArrowRight,
  Calendar,
  Sparkles,
  AlertCircle,
  Mic,
  Link2,
  Trash2,
  Search,
  CheckCircle2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, CallReport, CallReportSummary } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StatusPill } from "@/components/PendingChip";

interface CallAnalysisViewProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const AUDIO_ACCEPT = ".wav,.mp3,.m4a,.ogg,.flac,.aac,.opus,audio/*";

function sentimentTone(value?: string) {
  const v = (value || "").toLowerCase();
  if (/(positive|good|happy|satisfied|promising)/.test(v)) return "success" as const;
  if (/(negative|poor|angry|frustrated|risk)/.test(v)) return "danger" as const;
  if (/(mixed|neutral|unknown)/.test(v)) return "muted" as const;
  return "info" as const;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string | null, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function bulletLines(text?: string) {
  if (!text?.trim()) return [];
  const parts = text
    .split(/\n+/)
    .map((line) => line.replace(/^[•\-\*]\s*/, "").trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()];
}

export function CallAnalysisView({ isOpen, onClose, embedded = false }: CallAnalysisViewProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [inputMode, setInputMode] = useState<"upload" | "url">("upload");
  const [audioUrl, setAudioUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");

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

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        (r.title || "").toLowerCase().includes(q) ||
        (r.summary || "").toLowerCase().includes(q) ||
        (r.sentiment || "").toLowerCase().includes(q),
    );
  }, [reports, search]);

  const takeFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 100MB.");
      return;
    }
    setSelectedFile(file);
    setInputMode("upload");
  };

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
      setDetailTab("overview");
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

  const canAnalyze = inputMode === "upload" ? Boolean(selectedFile) : Boolean(audioUrl.trim());

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
          : "app-overlay z-[100]"
      }
    >
      <header className="app-overlay-header">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 gap-1 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Mic className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">Call analysis</h1>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {reports.length} report{reports.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="app-split">
        <aside className="chat-scroll app-split-side max-h-[46dvh] space-y-3 lg:max-h-none">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            New analysis
          </h2>

          <div className="card-soft space-y-3 p-4">
            <div className="space-y-1">
              <label className={fieldLabel}>Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sales call with John"
                className="h-9"
              />
            </div>

            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "upload" | "url")}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="upload">
                  <Upload />
                  File
                </TabsTrigger>
                <TabsTrigger value="url">
                  <Link2 />
                  URL
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-2 space-y-2">
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    takeFile(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex min-h-[5.5rem] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
                    dragOver ? "border-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/50",
                  )}
                >
                  {selectedFile ? (
                    <>
                      <FileText className="mb-1 h-4 w-4 text-primary" />
                      <p className="max-w-full truncate text-xs font-medium">{selectedFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="mb-1 h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-medium">Drop audio or click to browse</p>
                      <p className="text-[11px] text-muted-foreground">WAV, MP3, M4A · max 100MB</p>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept={AUDIO_ACCEPT}
                    onChange={(e) => {
                      takeFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                {selectedFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-3 w-3" />
                    Remove file
                  </Button>
                ) : null}
              </TabsContent>

              <TabsContent value="url" className="mt-2 space-y-1">
                <label className={fieldLabel}>Audio URL</label>
                <Input
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://example.com/recording.mp3"
                  className="h-9"
                />
              </TabsContent>
            </Tabs>

            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || !canAnalyze}
              className="h-9 w-full"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Transcribing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze with AI
                </>
              )}
            </Button>
          </div>

          <p className="flex items-start gap-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
            AI transcribes the recording, then returns a summary, sentiment, key points, and a next action.
          </p>
        </aside>

        <section className="flex max-h-[38dvh] min-h-0 w-full shrink-0 flex-col border-b bg-card lg:max-h-none lg:w-[min(100%,20rem)] lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-2 border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight">Reports</h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">{filteredReports.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter reports"
                className="h-8 pl-8"
              />
            </div>
          </div>

          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Loading reports</p>
              </div>
            ) : isError ? (
              <div className="px-4 py-10 text-center">
                <p className="text-xs font-medium text-destructive">Could not load reports</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{reportsError?.message}</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
                <Mic className="mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {reports.length === 0 ? "No reports yet. Upload a recording to start." : "No reports match that search"}
                </p>
              </div>
            ) : (
              filteredReports.map((r: CallReportSummary) => (
                <div
                  key={r.id}
                  className={cn(
                    "group flex items-start gap-1 border-b border-border/60 last:border-0",
                    selectedReportId === r.id && "bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReportId(r.id);
                      setDetailTab("overview");
                    }}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Mic className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title || "Call"}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(r.created_at)}
                        </p>
                      </div>
                    </div>
                    {r.summary ? (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{r.summary}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {r.sentiment ? <StatusPill label={r.sentiment} tone={sentimentTone(r.sentiment)} /> : null}
                      {r.score != null && r.score !== "" ? (
                        <span className="text-[10px] tabular-nums text-muted-foreground">{String(r.score)}/10</span>
                      ) : null}
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-2 mr-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => requestDeleteReport(r.id)}
                    disabled={deleteMutation.isPending}
                    title="Delete report"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <main className="chat-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {selectedReportId == null ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-1 text-center">
              <FileText className="mb-1 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Select a report or analyze a new recording</p>
            </div>
          ) : detailLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-[11px] text-muted-foreground">Loading report</p>
            </div>
          ) : reportDetail ? (
            <div className="mx-auto max-w-2xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight">{reportDetail.title || "Call"}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(reportDetail.created_at, true)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => requestDeleteReport(reportDetail.id)}
                  title="Delete report"
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {reportDetail.sentiment ? (
                  <StatusPill label={reportDetail.sentiment} tone={sentimentTone(reportDetail.sentiment)} />
                ) : null}
                {reportDetail.score != null && reportDetail.score !== "" ? (
                  <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    Score {String(reportDetail.score)}/10
                  </span>
                ) : null}
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-fit">
                  <TabsTrigger value="overview">
                    <CheckCircle2 />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="transcript">
                    <FileText />
                    Transcript
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3">
                  {reportDetail.summary ? (
                    <div className="card-soft p-4">
                      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Summary
                      </h3>
                      {bulletLines(reportDetail.summary).length > 1 ? (
                        <ul className="space-y-1.5 text-sm leading-relaxed">
                          {bulletLines(reportDetail.summary).map((line, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm leading-relaxed">{reportDetail.summary}</p>
                      )}
                    </div>
                  ) : null}

                  {reportDetail.key_points ? (
                    <div className="card-soft p-4">
                      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                        Key points
                      </h3>
                      <ul className="space-y-1.5 text-sm leading-relaxed">
                        {bulletLines(reportDetail.key_points).map((line, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {reportDetail.next_action ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                        Next action
                      </h3>
                      <p className="text-sm leading-relaxed">{reportDetail.next_action}</p>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="transcript">
                  <div className="card-soft p-4">
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      Transcript
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {reportDetail.transcript || "No transcript stored for this report."}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
