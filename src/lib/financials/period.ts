import { isValidIsoDate, monthName, todayIso } from "@/lib/dates";

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface Period { start: string; end: string; label: string | null }

/**
 * The statement's period, shared by the page and both downloads. A month + year pair (the "Monthly Report"
 * picker) wins and resolves to that calendar month; otherwise explicit start/end; otherwise year-to-date.
 */
export function resolvePeriod(q: Q): Period {
  const month = Number(one(q.month)), year = Number(one(q.year));
  if (Number.isInteger(month) && Number.isInteger(year) && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
    return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: lastDayOfMonth(year, month), label: `${monthName(month)} ${year}` };
  }
  const today = todayIso();
  const s = one(q.start), e = one(q.end);
  return { start: isValidIsoDate(s) ? s : `${today.slice(0, 4)}-01-01`, end: isValidIsoDate(e) ? e : today, label: null };
}

export interface TxFilters { start: string; end: string; type: "income" | "expense" | ""; category: number | null; archived: boolean }

/** The Transactions list's filters, shared by the page and its PDF/CSV downloads so all three agree. */
export function resolveTxFilters(q: Q): TxFilters {
  const today = todayIso();
  const s = one(q.start), e = one(q.end), t = one(q.type), c = Number(one(q.category));
  return {
    start: isValidIsoDate(s) ? s : `${today.slice(0, 7)}-01`,
    end: isValidIsoDate(e) ? e : today,
    type: t === "income" || t === "expense" ? t : "",
    category: Number.isInteger(c) && c > 0 ? c : null,
    archived: one(q.archived) === "1",
  };
}
