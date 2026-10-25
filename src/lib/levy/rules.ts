import { fromPesewas, toPesewas } from "@/lib/financials/money";

/** Diocesan levy arithmetic (pure). Amounts in cedis in, cedis out; computed in pesewas so totals never drift. */
export interface LevyLine { collected: number; percent: number | null; remitted: number }
export interface LevyResult { due: number; balance: number; state: "owing" | "settled" | "overpaid" }

/** A blank % means 100% (the whole collection goes to the diocese). */
export function levyFor(l: LevyLine): LevyResult {
  const pct = l.percent === null ? 100 : l.percent;
  const due = Math.round((toPesewas(l.collected) * pct) / 100);
  const balance = due - toPesewas(l.remitted);
  return { due: fromPesewas(due), balance: fromPesewas(balance), state: balance > 0 ? "owing" : balance < 0 ? "overpaid" : "settled" };
}

export function validPercent(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return { ok: false };
  const n = Number(t);
  return n >= 0 && n <= 100 ? { ok: true, value: n } : { ok: false };
}
