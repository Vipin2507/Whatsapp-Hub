import { toast } from "sonner";

// In production (Docker/Nginx), we use relative paths.
const API_BASE = "/api";

// --- TYPES ---
export interface Template {
  id: number;
  title: string;
  body: string;
  category: string;
}

export interface Message {
  id?: number;
  content: string;
  is_from_me: boolean;
  time: string;
  media_kind?: "image" | "video" | "audio" | "document" | "sticker" | null;
  media_url?: string | null;
  media_name?: string | null;
  media_mime?: string | null;
}

export interface Contact {
  id?: number;
  phone: string;
  name: string;
  stage?: string;
  assigned_to?: string;
  date?: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
}

export interface LeadList {
  id: number;
  title: string;
  description?: string;
  count: number;
}

export type RecurrenceType = "once" | "daily" | "every_n_days" | "weekly" | "hourly";

export interface RecurrenceConfig {
  interval_days?: number;
  days_of_week?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  interval_hours?: number;
}

export interface Schedule {
  id: number;
  phone: string;
  content: string;
  time: string;
  status: string;
  list_id?: number | null;
  list_title?: string | null;
  recurrence_type?: RecurrenceType;
  recurrence_config?: string | RecurrenceConfig | null;
}

export interface DashboardStats {
  total_leads: number;
  total_msgs: number;
  total_segments: number;
  pending_schedules: number;
  recent_leads?: number;
  recent_messages?: number;
  stage_distribution?: Record<string, number>;
  messages_timeline?: Array<{ date: string; count: number }>;
  leads_by_stage?: Record<string, number>;
  date_from?: string;
  date_to?: string;
}

export interface DashboardStatsParams {
  days?: number;
  date_from?: string;
  date_to?: string;
  stage?: string;
}

export interface WahaSession {
  name: string;
  status?: string;
  me?: { id?: string; name?: string } | null;
  engine?: { engine?: string };
  config?: Record<string, unknown>;
}

export interface User {
  id: number;
  username: string;
}

export interface AppPreferences {
  default_country_code: string;
  notify_pending_schedules: boolean;
  notify_new_messages: boolean;
  enter_to_send: boolean;
}

export interface AppSettings {
  user: {
    id: number;
    username: string;
    ai_enabled: boolean;
    is_admin: boolean;
  };
  whatsapp: {
    default_session: string;
  };
  preferences: AppPreferences;
}

export interface AdminUser extends User {
  assigned_session?: string;
}

export interface CallReportSummary {
  id: number;
  title: string;
  url?: string;
  summary: string;
  sentiment: string;
  score?: string | number;
  created_at: string | null;
}

export interface CallReport {
  id: number;
  title: string;
  url?: string;
  transcript: string;
  summary: string;
  sentiment: string;
  key_points: string;
  next_action: string;
  score?: string | number;
  created_at: string | null;
}

// --- HELPER FETCH WRAPPER ---
async function request(url: string, options: RequestInit = {}) {
  try {
    const isFormData = options.body instanceof FormData;
    const fetchOptions: RequestInit = {
      ...options,
      credentials: "include",
    };
    if (isFormData) {
      fetchOptions.headers = options.headers as Record<string, string>;
    } else {
      fetchOptions.headers = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 300000) : null;
    if (controller) fetchOptions.signal = controller.signal;
    try {
      const response = await fetch(`${API_BASE}${url}`, fetchOptions);

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");
      const text = await response.text();
      let data: Record<string, unknown> | null = null;
      if (response.status === 204 || response.status === 205) {
        data = {};
      } else if (text) {
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          if (isJson) throw new Error("Invalid JSON from server");
        }
      }

      if (response.status === 401 && !url.includes("/auth/me")) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }

      if (!response.ok) {
        let msg = (data && typeof data.message === "string")
          ? data.message
          : response.status === 502
            ? "Gateway Timeout: Server rebooting"
            : response.status >= 500
              ? "Internal Server Error (500)"
              : "Request failed";
        if (msg === "Internal Server Error (500)" && text && text.length > 0) {
          if (text.trimStart().startsWith("<")) {
            msg = "Server error during request. Check backend logs or try again.";
          } else {
            msg = text.length < 400 ? text.replace(/\s+/g, " ").trim() : text.slice(0, 200).replace(/\s+/g, " ").trim() + "...";
          }
        }
        throw new Error(msg);
      }

      // For DELETE requests, empty response is acceptable (204/205 already handled above)
      if (!data && text && response.status !== 204 && response.status !== 205) {
        throw new Error("Server returned non-JSON response");
      }
      return data ?? {};
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (error: any) {
    let errorMsg = error.message || "Unknown error";
    if (error.name === "AbortError") {
      errorMsg = "Request timeout (5 minutes). The file may be too large or the server is slow.";
    } else if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("Failed to fetch"))) {
      errorMsg = "Network error: Could not reach server. Check your connection and ensure the backend is running.";
    }
    console.error("API Error:", errorMsg, error);

    const isBackgroundPolling = url.includes("/auth/me") || url.includes("/session/status") || url.includes("/schedule") || url.includes("/dashboard/stats");
    const isDeleteOperation = options.method === "DELETE";
    // Don't show toast for DELETE - let the calling mutation handle it
    if (!isBackgroundPolling && !isDeleteOperation) {
      toast.error(`System Trace: ${errorMsg}`);
    }
    throw new Error(errorMsg);
  }
}

// --- API EXPORTS ---
export const api = {
  request,

  auth: {
    login: (credentials: any) => request("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
    logout: () => request("/auth/logout", { method: "POST" }),
    getMe: () => request("/auth/me"),
    changePassword: (current_password: string, new_password: string) =>
      request("/auth/password", {
        method: "PUT",
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  settings: {
    get: (): Promise<AppSettings> => request("/settings") as Promise<AppSettings>,
    updatePreferences: (data: Partial<AppPreferences>): Promise<{ preferences: AppPreferences }> =>
      request("/settings/preferences", {
        method: "PUT",
        body: JSON.stringify(data),
      }) as Promise<{ preferences: AppPreferences }>,
    setAutoReply: (enabled: boolean): Promise<{ ai_enabled: boolean }> =>
      request("/settings/auto-reply", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }) as Promise<{ ai_enabled: boolean }>,
  },

  dashboard: {
    getStats: (params?: DashboardStatsParams): Promise<DashboardStats> => {
      const search = new URLSearchParams();
      if (params?.days != null) search.set("days", String(params.days));
      if (params?.date_from) search.set("date_from", params.date_from);
      if (params?.date_to) search.set("date_to", params.date_to);
      if (params?.stage) search.set("stage", params.stage);
      const qs = search.toString();
      return request(`/dashboard/stats${qs ? `?${qs}` : ""}`);
    },
    getStatus: (): Promise<{ sessions: WahaSession[]; defaultSession: string }> => request("/session/status"),
  },

  waha: {
    listSessions: (): Promise<WahaSession[]> => request("/waha/sessions"),
    createSession: (data: { name?: string; config?: Record<string, unknown>; start?: boolean }) =>
      request("/waha/sessions", { method: "POST", body: JSON.stringify(data) }),
    getSession: (name: string): Promise<WahaSession> => request(`/waha/sessions/${encodeURIComponent(name)}`),
    startSession: (name: string) =>
      request(`/waha/sessions/${encodeURIComponent(name)}/start`, { method: "POST" }),
    stopSession: (name: string) =>
      request(`/waha/sessions/${encodeURIComponent(name)}/stop`, { method: "POST" }),
    restartSession: (name: string) =>
      request(`/waha/sessions/${encodeURIComponent(name)}/restart`, { method: "POST" }),
    deleteSession: (name: string) =>
      request(`/waha/sessions/${encodeURIComponent(name)}`, { method: "DELETE" }),
    getDefaultSession: (): Promise<{ session: string }> => request("/waha/default-session"),
    setDefaultSession: (session: string) =>
      request("/waha/default-session", { method: "PUT", body: JSON.stringify({ session }) }),
    getQrUrl: (name: string) => `/api/waha/sessions/${encodeURIComponent(name)}/qr`,
  },

  contacts: {
    getAll: (): Promise<Contact[]> => request("/contacts"),
    create: (data: Partial<Contact> | Partial<Contact>[]) =>
      request("/contacts", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    bulkUpdate: (data: { ids: number[], stage?: string, assigned_to?: string }) =>
      request("/contacts/bulk-update", {
        method: "PUT",
        body: JSON.stringify(data)
      }),
    update: (id: number, data: Partial<Contact>) =>
      request(`/contacts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data)
      }),
    delete: (id: number) =>
      request(`/contacts/${id}`, {
        method: "DELETE"
      }),
  },

  lists: {
    getAll: (): Promise<LeadList[]> => request("/lists"),
    create: (data: { title: string; description?: string; lead_ids?: number[] }) =>
      request("/lists", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    addLeads: (listId: string, lead_ids: number[]) =>
      request(`/lists/${listId}/add-leads`, {
        method: "POST",
        body: JSON.stringify({ lead_ids })
      }),
    getLeads: (listId: number): Promise<Contact[]> => request(`/lists/${listId}/leads`),
    removeLead: (listId: number, leadId: number) =>
      request(`/lists/${listId}/remove-lead`, {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId })
      }),
    broadcast: (listId: number, message: string) =>
      request(`/lists/${listId}/broadcast`, {
        method: "POST",
        body: JSON.stringify({ message })
      }),
    broadcastMedia: (listId: number, message: string, file: File) => {
      const form = new FormData();
      form.append("message", message);
      form.append("file", file);
      return request(`/lists/${listId}/broadcast`, {
        method: "POST",
        body: form,
      });
    },
    delete: (listId: number) =>
      request(`/lists/${listId}`, { method: "DELETE" }),
  },

  admin: {
    listUsers: (): Promise<AdminUser[]> => request("/admin/users"),
    createUser: (data: any) =>
      request("/admin/create-user", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    deleteUser: (id: number) =>
      request(`/admin/users/${id}`, {
        method: "DELETE"
      }),
    setUserDefaultSession: (userId: number, session: string) =>
      request(`/admin/users/${userId}/default-session`, {
        method: "PUT",
        body: JSON.stringify({ session })
      }),
  },

  chat: {
    getMessages: (phone: string): Promise<Message[]> => request(`/conversation/${phone}`),
    sendMessage: (to: string, message: string) => request("/send", {
      method: "POST",
      body: JSON.stringify({ to, message })
    }),
    sendMedia: (to: string, caption: string, file: File) => {
      const form = new FormData();
      form.append("to", to);
      form.append("message", caption);
      form.append("file", file);
      return request("/send-media", { method: "POST", body: form });
    },
  },

  templates: {
    getAll: (): Promise<Template[]> => request("/templates"),
    aiGenerate: (prompt: string) => request("/templates/ai-generate", {
      method: "POST",
      body: JSON.stringify({ prompt })
    }),
    create: (data: Partial<Template>) => request("/templates", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    update: (id: number, data: Partial<Template>) => request(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
    delete: (id: number) => request(`/templates/${id}`, { method: "DELETE" }),
  },

  schedule: {
    getAll: (): Promise<Schedule[]> => request("/schedule"),
    create: (data: { phone: string; message: string; time: string; recurrence_type?: RecurrenceType; recurrence_config?: RecurrenceConfig }) => request("/schedule", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    createBatch: (data: { listId: string; time: string; message: string; recurrence_type?: RecurrenceType; recurrence_config?: RecurrenceConfig }) =>
      request("/schedule/batch", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    update: (id: number, data: { phone?: string; message?: string; time?: string }) =>
      request(`/schedule/${id}`, {
        method: "PUT",
        body: JSON.stringify(data)
      }),
    delete: (id: number) => request(`/schedule/${id}`, { method: "DELETE" }),
    retry: (id: number) => request(`/schedule/retry/${id}`, { method: "POST" }),
  },

  helpbot: {
    chat: (message: string) => request("/helpbot", {
      method: "POST",
      body: JSON.stringify({ message })
    }),
    assist: (prompt: string) => request("/ai-assist", {
      method: "POST",
      body: JSON.stringify({ prompt })
    }),
  },

  callAnalysis: {
    analyzeWithAudio: (formData: FormData): Promise<{ status: string; report: CallReport }> =>
      request("/call-analysis/analyze", { method: "POST", body: formData }),
    getReports: (): Promise<CallReportSummary[]> => request("/call-analysis/reports"),
    getReport: (id: number): Promise<CallReport> => request(`/call-analysis/reports/${id}`),
    deleteReport: (id: number): Promise<void> =>
      request(`/call-analysis/reports/${id}`, { method: "DELETE" }),
  },

  conversations: {
    getAll: (): Promise<Conversation[]> => request("/conversations"),
    get: (id: number): Promise<ConversationDetail> => request(`/conversations/${id}`),
    create: (data: Partial<Conversation>): Promise<{ status: string; id: number }> =>
      request("/conversations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Conversation>): Promise<{ status: string }> =>
      request(`/conversations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> =>
      request(`/conversations/${id}`, { method: "DELETE" }),
    addStep: (convId: number, data: ConversationStep): Promise<{ status: string; id: number }> =>
      request(`/conversations/${convId}/steps`, { method: "POST", body: JSON.stringify(data) }),
    updateStep: (convId: number, stepId: number, data: Partial<ConversationStep>): Promise<{ status: string }> =>
      request(`/conversations/${convId}/steps/${stepId}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteStep: (convId: number, stepId: number): Promise<void> =>
      request(`/conversations/${convId}/steps/${stepId}`, { method: "DELETE" }),
    addTrigger: (convId: number, data: ConversationTrigger): Promise<{ status: string; id: number }> =>
      request(`/conversations/${convId}/triggers`, { method: "POST", body: JSON.stringify(data) }),
    updateTrigger: (convId: number, triggerId: number, data: Partial<ConversationTrigger>): Promise<{ status: string }> =>
      request(`/conversations/${convId}/triggers/${triggerId}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteTrigger: (convId: number, triggerId: number): Promise<void> =>
      request(`/conversations/${convId}/triggers/${triggerId}`, { method: "DELETE" }),
    getInstances: (convId: number): Promise<ConversationInstance[]> =>
      request(`/conversations/${convId}/instances`),
  },
};

export type ConversationTriggerType = "keyword" | "exact" | "contains" | "regex" | "any";

export interface ConversationStep {
  id?: number;
  step_order: number;
  message_content: string;
  delay_after_seconds?: number;
}

export interface ConversationTrigger {
  id?: number;
  from_step_id: number;
  to_step_id: number;
  trigger_type: ConversationTriggerType;
  trigger_value?: string | string[]; // For keyword: array, for others: string
  is_case_sensitive?: boolean;
}

export interface Conversation {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  target_type: "contact" | "list";
  target_phone?: string;
  target_list_id?: number;
  initial_scheduled_time?: string | null;
  created_at?: string;
  step_count?: number;
}

export interface ConversationDetail extends Conversation {
  steps: ConversationStep[];
  triggers: ConversationTrigger[];
}

export interface ConversationInstance {
  id: number;
  phone: string;
  status: string;
  current_step_id?: number;
  started_at?: string;
  last_activity_at?: string;
}