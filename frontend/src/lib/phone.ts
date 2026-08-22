/** Excel / CSV cells may be numbers; avoid scientific notation surprises for typical phone magnitudes. */
export function stringifyPhoneCellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const t = Math.trunc(value);
    if (Math.abs(value - t) < 1e-9 && Math.abs(t) <= Number.MAX_SAFE_INTEGER) {
      return String(t);
    }
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  return String(value).trim();
}

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Pick the phone value from a spreadsheet row when the column is not exactly named "phone".
 * Handles Mobile, Lead Phone, WhatsApp, MSISDN, etc.
 */
export function extractRawPhoneFromRow(row: Record<string, unknown>): string {
  if (!row || typeof row !== "object") return "";

  const entries = Object.entries(row).filter(([k, v]) => {
    if (k == null || String(k).startsWith("__")) return false;
    if (v == null) return false;
    return stringifyPhoneCellValue(v) !== "";
  });
  if (entries.length === 0) return "";

  const preferredExact = [
    "phone number",
    "mobile number",
    "whatsapp number",
    "whatsapp no",
    "whatsapp no.",
    "whatsapp",
    "telephone",
    "cell number",
    "mobile",
    "phone",
    "tel",
    "cell",
    "msisdn",
    "contact number",
    "primary phone",
    "lead phone",
    "lead_phone",
    "contact phone",
    "intl phone",
    "international phone",
  ];

  for (const p of preferredExact) {
    const hit = entries.find(([k]) => normHeader(k) === p);
    if (hit) return stringifyPhoneCellValue(hit[1]);
  }

  const wordHit = entries.find(([k]) =>
    /\b(phone|mobile|cell|tel|whatsapp|telephone|msisdn)\b/i.test(normHeader(k))
  );
  if (wordHit) return stringifyPhoneCellValue(wordHit[1]);

  const legacy =
    row.phone ??
    row.Phone ??
    row.PHONE ??
    row.Mobile ??
    row.MOBILE ??
    row.lead_phone ??
    row.Lead_Phone ??
    row.LEAD_PHONE;
  if (legacy != null && stringifyPhoneCellValue(legacy) !== "") {
    return stringifyPhoneCellValue(legacy);
  }

  return "";
}

/**
 * Normalize to digits-only international form (WhatsApp / WAHA style, no "+").
 *
 * - Values that clearly start as international (+… or 00…) keep all digits after that prefix
 *   so country codes from Excel (e.g. +234…) are preserved.
 * - Exactly 10 digits without an international prefix default to India (91), matching existing behaviour.
 * - Longer digit-only strings are kept as-is (already include a country calling code).
 */
export function normalizeContactPhone(raw: unknown): string {
  const s =
    typeof raw === "number" || typeof raw === "bigint"
      ? stringifyPhoneCellValue(raw)
      : String(raw ?? "").trim();
  if (!s) return "";

  let explicitInternational = false;
  let body = s;

  if (body.startsWith("+")) {
    explicitInternational = true;
    body = body.slice(1);
  } else if (body.startsWith("00")) {
    explicitInternational = true;
    body = body.slice(2);
  }

  const digits = body.replace(/\D/g, "");
  if (!digits) return "";

  const capped = digits.length > 15 ? digits.slice(0, 15) : digits;

  if (explicitInternational) {
    return capped;
  }

  if (capped.length === 10) {
    return `91${capped}`;
  }

  return capped;
}
