const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Reads a date typed as day/month/year: 01/11/2026, 1/11/2026, 01-11-2026, 01.11.2026 or 01112026.
 * Day always comes first, so day and month can't swap. Returns yyyy-mm-dd, or null if it is not a real date.
 */
export function parseDmy(text: string): string | null {
  const t = text.trim();
  const m = t.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/) ?? t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** "2025-12-23" (also 2025-12-3 or 2025/12/23) → "2025-12-23", or null if it isn't a real date. */
export function parseIso(text: string): string | null {
  const m = text.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** yyyy-mm-dd → dd/mm/yyyy. Anything else (a date as the site shows it, say) comes back as it is. */
export function isoToDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** yyyy-mm-dd → "1 November 2026" */
export function isoToWords(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/** Passport as the site expects it: no spaces, capital letters. */
export const normalizePassport = (t: string) => t.replace(/\s+/g, '').toUpperCase();
export const isValidPassport = (p: string) => /^[A-Z0-9]{5,15}$/.test(p);

/** Removes every space, for values like the LUC number copied from a PDF. */
export const removeSpaces = (t: string) => t.replace(/\s+/g, '');

/** Trims the ends and turns runs of spaces or line breaks into one space. */
export const tidySpaces = (t: string) => t.replace(/\s+/g, ' ').trim();

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
}

export function formatDuration(ms: number): string {
  if (ms < 10_000) return `${(Math.max(ms, 100) / 1000).toFixed(1)}s`;
  return formatElapsed(ms);
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
