/**
 * Dates in the way a site box writes them. A pattern names the order of day, month and year and the mark
 * between them, such as dd/mm/yyyy. 'iso' is a calendar box, which holds yyyy-mm-dd whatever it shows.
 */

/** The pattern a box's hint shows ("dd/mm/yyyy", "DD-MM-YYYY"), or null when the hint isn't one. */
export function datePattern(hint: string | null | undefined): string | null {
  const m = (hint || '').trim().toLowerCase().match(/^(dd|mm|yyyy)([/.\- ])(dd|mm|yyyy)\2(dd|mm|yyyy)$/);
  if (!m) return null;
  if (new Set([m[1], m[3], m[4]]).size !== 3) return null;
  return `${m[1]}${m[2]}${m[3]}${m[2]}${m[4]}`;
}

const realDate = (y: number, mo: number, d: number) => {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

/** A yyyy-mm-dd date written in a box's own way. */
export function writeDate(iso: string, format: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || format === 'iso') return iso;
  const parts: Record<string, string> = { yyyy: m[1], mm: m[2], dd: m[3] };
  return format.replace(/yyyy|mm|dd/g, (k) => parts[k]);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date a box shows in some other way than its own pattern, as yyyy-mm-dd: yyyy-mm-dd, a day-first date
 * (01/11/2026, 1-11-2026) or one with the month's name (1 Nov 2026, 01-Nov-2026, Nov 1, 2026). Null otherwise.
 */
export function readDateLoose(text: string): string | null {
  const t = text.trim().replace(/\s+/g, ' ');
  const out = (y: number, mo: number, d: number) => (realDate(y, mo, d) ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return out(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (m) return out(Number(m[3]), Number(m[2]), Number(m[1]));
  const month = (name: string) => {
    const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
    return i >= 0 && /^[a-z]+$/i.test(name) ? i + 1 : 0;
  };
  m = t.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/., ]+(\d{4})$/);
  if (m && month(m[2])) return out(Number(m[3]), month(m[2]), Number(m[1]));
  m = t.match(/^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})$/);
  if (m && month(m[1])) return out(Number(m[3]), month(m[1]), Number(m[2]));
  return null;
}

/** What a box shows, as yyyy-mm-dd. Null when it isn't a real date written that way. */
export function readDate(text: string, format: string): string | null {
  const t = text.trim();
  if (format === 'iso') {
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m && realDate(Number(m[1]), Number(m[2]), Number(m[3])) ? t : null;
  }
  const order = format.match(/yyyy|mm|dd/g) ?? [];
  const sep = format.replace(/yyyy|mm|dd/g, '').charAt(0);
  const bits = t.split(sep);
  if (order.length !== 3 || bits.length !== 3) return null;
  const got: Record<string, string> = {};
  order.forEach((k, i) => {
    got[k] = bits[i];
  });
  if (!/^\d{4}$/.test(got.yyyy ?? '') || !/^\d{1,2}$/.test(got.mm ?? '') || !/^\d{1,2}$/.test(got.dd ?? '')) return null;
  const y = Number(got.yyyy);
  const mo = Number(got.mm);
  const d = Number(got.dd);
  if (!realDate(y, mo, d)) return null;
  return `${got.yyyy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
