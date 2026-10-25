import { toPesewas } from "./money";

/**
 * Dues "waterfall" (port of DuesService): a member owes one annual amount for every year since they
 * joined through the reported year. All payments ever recorded for that member + category are pooled
 * and applied oldest-year-first; money left over once every year is covered is an advance balance.
 * The fiscal_year stored with each payment is only a bookkeeping label — it does not pick the year it settles.
 */
export type MemberTier = "child" | "youth" | "adult";

export interface DuesCategory {
  isTiered: boolean;
  annualDuesAmount: string | number | null;
  tierChildAmount: string | number | null;
  tierYouthAmount: string | number | null;
  tierAdultAmount: string | number | null;
}

/** Pesewas a member owes per year: the matching tier amount when tiered pricing is on, else the flat amount. */
export function expectedAmountFor(cat: DuesCategory, tier: string | null | undefined): number {
  if (cat.isTiered) {
    const t = tier === "child" ? cat.tierChildAmount : tier === "youth" ? cat.tierYouthAmount : cat.tierAdultAmount;
    return toPesewas(t);
  }
  return toPesewas(cat.annualDuesAmount);
}

export interface YearAllocation { expected: number; paid: number; balance: number }
export interface Waterfall { years: Record<number, YearAllocation>; arrears: number; advance: number }

/** All figures in pesewas. */
export function allocateWaterfall(expected: number, totalPaid: number, sinceYear: number, asOfYear: number): Waterfall {
  let remaining = totalPaid;
  let arrears = 0;
  const years: Record<number, YearAllocation> = {};
  for (let y = sinceYear; y <= asOfYear; y++) {
    const allocated = Math.min(remaining, expected);
    remaining -= allocated;
    const balance = expected - allocated;
    if (balance > 0) arrears += balance;
    years[y] = { expected, paid: allocated, balance };
  }
  return { years, arrears, advance: Math.max(remaining, 0) };
}

export type DuesStatus = "Paid" | "Partial" | "Unpaid" | "Overpaid";

export function statusFor(paid: number, balance: number): DuesStatus {
  if (paid <= 0) return "Unpaid";
  if (balance > 0) return "Partial";
  if (balance < 0) return "Overpaid";
  return "Paid";
}
