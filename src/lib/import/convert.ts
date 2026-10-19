/**
 * Spreadsheet cell -> typed value rules for imports (port of ImportService.php + import_helpers.php).
 * Pure functions only: no database, fully unit-tested. Dates are DAY-FIRST (this parish's locale).
 */
import { isValidIsoDate } from "@/lib/dates";
import type { FieldDef } from "@/lib/registers/types";

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string | null => { const s = `${y}-${pad(m)}-${pad(d)}`; return isValidIsoDate(s) ? s : null; };

/** Placeholder words spreadsheets use instead of an empty cell (NaN from pandas exports, n/a, dashes...). */
const BLANK_MARKERS = new Set(["nan", "n/a", "na", "null", "none", "-", "--", "#n/a", "unknown", "tbd"]);
export const isBlankMarker = (s: string) => BLANK_MARKERS.has(s.trim().toLowerCase());
export const isBlankRow = (row: string[]) => row.every((c) => (c ?? "").trim() === "");

/** Excel day-serial (1900 system) -> ISO date. */
export function serialToDate(serial: number): string | null {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export interface DateResult { value: string | null; warning?: string }

/** A two-digit year in a marriage/baptism register is almost always the past: 98 -> 1998, 05 -> 2005 (flagged so staff can check). */
function expandYear(yy: number): number {
  const now = Number(new Intl.DateTimeFormat("en", { year: "2-digit", timeZone: "Africa/Accra" }).format(new Date()));
  return yy <= now ? 2000 + yy : 1900 + yy;
}

/** Excel serials, ISO, day-first d/m/Y (also - and .), "17 December 2022", "December 17, 2022"; m/d/Y only when day-first is impossible. */
export function parseDate(raw: string): DateResult {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 19700 && n < 80000 ? { value: serialToDate(n) } : { value: null };
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/.exec(s);
  if (m) return { value: iso(+m[1]!, +m[2]!, +m[3]!) };

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1]!, b = +m[2]!, ys = m[3]!;
    const two = ys.length === 2;
    const y = two ? expandYear(+ys) : +ys;
    const v = iso(y, b, a) ?? iso(y, a, b); // day-first, else month-first (e.g. 12/31/2019)
    if (!v) return { value: null };
    return two ? { value: v, warning: `two-digit year "${ys}" read as ${y}` } : { value: v };
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[2]!.toLowerCase()]) return { value: iso(+m[3]!, MONTHS[m[2]!.toLowerCase()]!, +m[1]!) };
  m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1]!.toLowerCase()]) return { value: iso(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!) };
  return { value: null };
}

export interface PartialResult { year: number | null; month: number | null; day: number | null; error?: string }

/** Birth dates in old registers are often only a year, or a month and year. */
export function parsePartialDate(raw: string): PartialResult {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n >= 1850 && n <= 2100) return { year: n, month: null, day: null };
    if (Number(s) > 19700 && Number(s) < 80000) { const d = serialToDate(Number(s)); if (d) { const [y, mo, da] = d.split("-").map(Number) as [number, number, number]; return { year: y, month: mo, day: da }; } }
    return { year: null, month: null, day: null, error: `"${raw}" doesn't look like a valid year or date.` };
  }
  const full = parseDate(s);
  if (full.value) { const [y, mo, da] = full.value.split("-").map(Number) as [number, number, number]; return { year: y, month: mo, day: da }; }
  let m = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1]!.toLowerCase()]) return { year: +m[2]!, month: MONTHS[m[1]!.toLowerCase()]!, day: null };
  m = /^(\d{1,2})[/-](\d{4})$/.exec(s);
  if (m && +m[1]! >= 1 && +m[1]! <= 12) return { year: +m[2]!, month: +m[1]!, day: null };
  return { year: null, month: null, day: null, error: `"${raw}" doesn't look like a year, month/year, or full date.` };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Accepts the stored value ("mixed_religion"), its label ("Mixed religion") or a close spelling. */
export function resolveSelect(raw: string, options: Record<string, string>): string | null {
  const needle = norm(raw);
  if (!needle) return null;
  for (const [stored, label] of Object.entries(options)) if (norm(stored) === needle || norm(label) === needle) return stored;
  return null;
}

// ---------------------------------------------------------------- column mapping
/** Splits on " — " only OUTSIDE parentheses ("Nus (Baptism Register No. — for marginal note)" stays whole). */
function splitDash(label: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < label.length; i++) {
    const ch = label[i]!;
    if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && label.startsWith(" — ", i)) { parts.push(cur.trim()); cur = ""; i += 2; continue; }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

/**
 * Header words a spreadsheet might use for a field. "Groom — Nomen (Given Name)" ->
 * nomen, givenname, groomnomen, groomgivenname; "MATRIM — Dies (Date of Marriage)" -> dies, dateofmarriage, ...
 * Both the Latin register term and the English one are accepted, with or without the Groom/Bride prefix.
 */
export function labelTerms(label: string): string[] {
  const parts = splitDash(label);
  const last = parts[parts.length - 1] ?? label;
  const prefixes = parts.slice(0, -1).map(norm);
  const paren = /\(([^)]*)\)/.exec(last);
  const english = paren ? norm(paren[1]!.split(" — ")[0]!) : "";
  const latin = norm(last.replace(/\([^)]*\)/g, ""));
  const out = new Set<string>([norm(label), latin, english]);
  for (const p of prefixes) for (const t of [latin, english]) if (t) out.add(p + t);
  out.delete("");
  return [...out];
}

/** Suggests which spreadsheet column feeds each field: exact header matches first, then a loose "contains" pass. */
export function autoSuggestMapping(fields: { key: string; label: string }[], headers: string[]): Record<string, number | null> {
  const hs = headers.map(norm);
  const used = new Set<number>();
  const mapping: Record<string, number | null> = {};
  for (const f of fields) {
    const terms = labelTerms(f.label);
    let match: number | null = null;
    hs.forEach((h, i) => { if (match === null && !used.has(i) && h !== "" && terms.includes(h)) match = i; });
    if (match === null) hs.forEach((h, i) => { if (match === null && !used.has(i) && h.length >= 3 && terms.some((t) => t.includes(h))) match = i; });
    if (match !== null) used.add(match);
    mapping[f.key] = match;
  }
  return mapping;
}

/** 0 -> A, 25 -> Z, 26 -> AA (so people can match the letters in their spreadsheet). */
export function columnLetter(i: number): string {
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

// ---------------------------------------------------------------- converting one cell
export type CellResult = { value: string | number | null; error?: string; warning?: string };

/** Converts a trimmed, blank-marker-cleaned cell for the simple field types. Reference lookups are done by the caller. */
export function convertCell(raw: string | null, f: Pick<FieldDef, "type" | "label" | "options">): CellResult {
  if (f.type === "checkbox") return { value: raw && ["1", "true", "yes", "y", "x"].includes(raw.toLowerCase()) ? 1 : 0 };
  if (raw === null || raw === "") return { value: null };
  switch (f.type) {
    case "date": {
      const d = parseDate(raw);
      return d.value ? { value: d.value, warning: d.warning } : { value: null, error: `'${f.label}' value "${raw}" doesn't look like a valid date.` };
    }
    case "year": {
      if (!/^\d{3,4}$/.test(raw) || +raw < 1850 || +raw > 2100) return { value: null, error: `'${f.label}' value "${raw}" doesn't look like a valid year.` };
      return { value: +raw };
    }
    case "select": {
      const v = resolveSelect(raw, f.options ?? {});
      return v ? { value: v } : { value: null, error: `'${f.label}' value "${raw}" doesn't match any of: ${Object.keys(f.options ?? {}).join(", ")}.` };
    }
    default:
      return { value: raw };
  }
}

// ---------------------------------------------------------------- "one person per row" sheets
/**
 * Many registers list the groom's row, then the bride's row directly below it. Rows are paired two at a time (blank rows
 * skipped); marriage-level fields are read from the groom's row, falling back to the bride's if blank.
 * Returns combined rows shaped like `fieldKeys` (marriage keys, then groom_*, then bride_*).
 */
export function buildPairedRows(
  rows: string[][], hasHeader: boolean, mapping: Record<string, number | null>, fieldKeys: string[],
): { rows: string[][]; rowNumbers: number[]; notes: string[] } {
  const out: string[][] = [], rowNumbers: number[] = [], notes: string[] = [];
  let i = hasHeader ? 1 : 0;
  const total = rows.length;
  const cellAt = (row: string[], key: string) => { const c = mapping[key]; return c === null || c === undefined ? "" : (row[c] ?? ""); };
  while (i < total) {
    while (i < total && isBlankRow(rows[i]!)) i++;
    if (i >= total) break;
    const groom = rows[i]!, groomNo = i + 1; i++;
    while (i < total && isBlankRow(rows[i]!)) i++;
    let bride: string[] = [];
    if (i >= total) notes.push(`Row ${groomNo}: no following row found for the bride — this record will be skipped.`);
    else { bride = rows[i]!; i++; }
    const combined = fieldKeys.map((k) => {
      if (k.startsWith("groom_")) return cellAt(groom, k.slice(6));
      if (k.startsWith("bride_")) return cellAt(bride, k.slice(6));
      return cellAt(groom, k) || cellAt(bride, k);
    });
    out.push(combined); rowNumbers.push(groomNo); // a missing bride row leaves the bride blank, so validation reports it clearly
  }
  return { rows: out, rowNumbers, notes };
}
