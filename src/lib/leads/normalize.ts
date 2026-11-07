/** Normalisation for identity matching. Never invents data: unparseable input returns null. */
export function normalizeEmail(v?: string | null): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/** Digits with optional leading +. Requires 7–15 digits (E.164 upper bound). */
export function normalizePhone(v?: string | null): string | null {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (raw.startsWith("+") ? "+" : "") + digits;
}

/** Registrable-ish host: lowercased, no scheme/www/path. Used for organization identity. */
export function normalizeDomain(v?: string | null): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  try {
    const host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function cleanText(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "protonmail.com"]);
/** Company domain from an e-mail, ignoring free-mail providers (which say nothing about the organisation). */
export function domainFromEmail(email: string | null): string | null {
  const d = email?.split("@")[1];
  return d && !FREE_MAIL.has(d) ? d : null;
}

export function escapeCsvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
