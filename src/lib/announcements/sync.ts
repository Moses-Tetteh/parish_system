import { isCategory, categoryLabel, type Category } from "./categories";
import { sanitizeRich } from "./sanitize";

/** Pure helpers for the Google Form -> announcements sync (port of GoogleFormSyncService). Unit-tested; the fetch lives in repository code. */
const COLUMN_KEYWORDS = {
  timestamp: ["timestamp"],
  category: ["category", "type of announcement", "general or funeral"],
  title: ["title", "subject", "heading"],
  content: ["announcement", "message", "details", "description"],
  announcement_date: ["date to be announced", "mass date", "announcement date", "sunday"],
  name: ["name", "full name"],
  contact: ["contact", "phone", "email"],
} as const;
export type ColumnKey = keyof typeof COLUMN_KEYWORDS;

const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ["funeral", ["funeral", "burial", "wake", "death", "deceased", "demise"]],
  ["weekday_masses", ["weekday mass", "weekday masses"]],
  ["liturgy_schedule", ["liturgy schedule", "liturgy", "mass schedule"]],
  ["general_meetings", ["general meeting"]],
  ["meetings", ["meeting"]],
  ["other_blessings", ["blessing", "thanksgiving"]],
  ["publication_of_banns", ["banns", "publication of banns", "marriage bann"]],
  ["health_tips", ["health tip", "health"]],
  ["notice", ["notice"]],
];

export function matchCategory(raw: string): Category {
  const s = raw.toLowerCase();
  for (const [cat, kws] of CATEGORY_KEYWORDS) if (kws.some((k) => s.includes(k))) return cat;
  return "notice";
}

/** First header containing a keyword wins, and a column is never used for two fields (so "Name of deceased" cannot hijack the submitter column twice). */
export function mapColumns(header: string[]): Record<ColumnKey, number | null> {
  const lower = header.map((h) => h.trim().toLowerCase());
  const used = new Set<number>();
  const out = {} as Record<ColumnKey, number | null>;
  for (const key of Object.keys(COLUMN_KEYWORDS) as ColumnKey[]) {
    out[key] = null;
    for (const kw of COLUMN_KEYWORDS[key]) {
      const i = lower.findIndex((h, idx) => !used.has(idx) && h.includes(kw));
      if (i >= 0) { out[key] = i; used.add(i); break; }
    }
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Accepts ISO, d/m/y (Ghana day-first), "5 Oct 2026", and a Sheets "m/d/y h:m:s" timestamp when the day-first reading is impossible. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2200 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ok(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!;
    return ok(y, +m[2]!, +m[1]!) ?? ok(y, +m[1]!, +m[2]!); // day-first, falling back to month-first when impossible
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
  if (m) { const mi = MONTHS.indexOf(m[2]!.toLowerCase()); return mi >= 0 ? ok(+m[3]!, mi + 1, +m[1]!) : null; }
  return null;
}

export interface SyncRow {
  responseId: string; category: Category; title: string; content: string; announcementDate: string; name: string | null; contact: string | null;
}
export interface PlanResult { rows: SyncRow[]; skipped: number; errors: string[] }

/** Turns sheet rows into announcements to insert. `known` = response ids already imported. */
export function planSync(rows: string[][], known: Set<string>, today: string): PlanResult {
  if (!rows.length) return { rows: [], skipped: 0, errors: ["The sheet returned no rows."] };
  const [header, ...data] = rows;
  const col = mapColumns(header!);
  if (col.timestamp === null || col.content === null) {
    throw new Error("Could not find a 'Timestamp' and an announcement/message column in the sheet’s header row — check the Form question wording.");
  }
  const out: SyncRow[] = [], errors: string[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  data.forEach((row, i) => {
    if (row.every((c) => !String(c ?? "").trim())) return; // blank trailing row
    const get = (k: ColumnKey) => (col[k] !== null ? String(row[col[k]!] ?? "").trim() : "");
    const n = i + 2;
    const id = get("timestamp");
    if (!id) { skipped++; errors.push(`Row ${n}: missing Timestamp, skipped.`); return; }
    if (known.has(id) || seen.has(id)) { skipped++; return; } // already synced
    const content = get("content");
    if (!content) { skipped++; errors.push(`Row ${n}: blank announcement text, skipped.`); return; }
    const category = matchCategory(get("category"));
    seen.add(id);
    out.push({
      responseId: id.slice(0, 200), category, title: (get("title") || `${categoryLabel(category)} (from parishioner)`).slice(0, 200),
      content: sanitizeRich(content), announcementDate: parseDate(get("announcement_date")) ?? parseDate(id) ?? today,
      name: get("name").slice(0, 200) || null, contact: get("contact").slice(0, 200) || null,
    });
  });
  return { rows: out, skipped, errors };
}

/**
 * The sync URL is typed into Settings by staff but fetched by the SERVER, so it is restricted to https Google hosts
 * (a Sheets "publish to web" CSV link) — otherwise it would be a server-side request forgery primitive.
 */
export function assertGoogleCsvUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("The Google Form sync URL is not a valid address."); }
  const host = u.hostname.toLowerCase();
  const okHost = host === "docs.google.com" || host === "sheets.googleapis.com" || host.endsWith(".googleusercontent.com");
  if (u.protocol !== "https:" || !okHost || u.username || u.password) throw new Error("The sync URL must be a https://docs.google.com link to a published CSV.");
  return u;
}
export { isCategory };
