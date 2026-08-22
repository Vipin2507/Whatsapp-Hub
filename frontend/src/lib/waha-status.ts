/** WAHA / WAHA Plus session status helpers. Healthy sessions often report WORKING. */

export type WahaHealth = {
  live: boolean;
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
};

export function normalizeWahaStatus(status?: string | null) {
  return (status || "").trim().toUpperCase();
}

export function isWahaLive(status?: string | null) {
  const value = normalizeWahaStatus(status);
  return value === "WORKING" || value === "CONNECTED" || value === "ONLINE";
}

export function wahaHealth(status?: string | null): WahaHealth {
  const value = normalizeWahaStatus(status);
  if (isWahaLive(value)) return { live: true, label: "Live", tone: "success" };
  if (value === "STARTING") return { live: false, label: "Connecting", tone: "warning" };
  if (value === "SCAN_QR_CODE") return { live: false, label: "Scan QR", tone: "warning" };
  if (value === "FAILED") return { live: false, label: "Failed", tone: "danger" };
  if (!value) return { live: false, label: "Offline", tone: "muted" };
  return { live: false, label: value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), tone: "muted" };
}
