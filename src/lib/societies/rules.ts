/** Society dues helpers (pure). Period labels: monthly 2026-10, quarterly 2026-Q4, annual 2026. */
export const OFFICES = ["Member", "Chairperson", "Vice Chairperson", "Secretary", "Treasurer", "Organiser", "Chaplain"] as const;
export const PERIOD_RE = /^\d{4}(-\d{2}|-Q[1-4])?$/;

export function defaultPeriod(duesPeriod: string | null, todayIso: string): string {
  const y = todayIso.slice(0, 4), m = Number(todayIso.slice(5, 7));
  if (duesPeriod === "annual") return y;
  if (duesPeriod === "quarterly") return `${y}-Q${Math.ceil(m / 3)}`;
  return todayIso.slice(0, 7);
}

/** A monthly label must be a real month (2026-13 is rejected), a quarterly one Q1–Q4. */
export function isValidPeriod(p: string): boolean {
  if (!PERIOD_RE.test(p)) return false;
  const mm = /^\d{4}-(\d{2})$/.exec(p);
  return mm ? Number(mm[1]) >= 1 && Number(mm[1]) <= 12 : true;
}

/** "Paid in full" = at least the dues amount; when no amount is set, any payment counts. */
export const paidInFull = (paid: number, due: number): boolean => (due > 0 ? paid >= due : paid > 0);
export const outstanding = (paid: number, due: number): number => (due > 0 && paid < due ? Math.round((due - paid) * 100) / 100 : 0);
