import { birthYearsCompatible, looksLikeSamePerson, parentsCompatible, sameName, tokens } from "./name-matcher";

/**
 * Port of ParishionerMerger.php: deciding whether two Parishioners rows are one person, which row survives, and what
 * the survivor inherits. Pure (rows are plain snake_case column objects) so every rule is unit-tested without a database.
 */
export type Row = Record<string, unknown>;
export type Tier = "same_parents" | "likely" | "name_only";
export const LINK_COLUMNS = ["baptism_id", "communion_id", "confirmation_id", "orders_id", "marriage_spouse_id", "matrimony_id"] as const;

type State = "here" | "elsewhere" | "not_yet" | "unsure";
const RECEIVED = { here: "received_here", elsewhere: "received_elsewhere", not_yet: "not_received", unsure: "unknown" } as const;
export const SACRAMENTS = {
  baptism: { statusCol: "baptised_status", dateCol: "baptism_date", placeCol: "baptism_place", linkCol: "baptism_id", db: { here: "baptised_here", elsewhere: "baptised_elsewhere", not_yet: "not_baptised", unsure: "unknown" } },
  communion: { statusCol: "communion_status", dateCol: "communion_date", placeCol: "communion_place", linkCol: "communion_id", db: RECEIVED },
  confirmation: { statusCol: "confirmation_status", dateCol: "confirmation_date", placeCol: "confirmation_place", linkCol: "confirmation_id", db: RECEIVED },
  matrimony: { statusCol: "matrimony_status", dateCol: "marriage_date", placeCol: "marriage_place", linkCol: "matrimony_id", db: RECEIVED },
  orders: { statusCol: "orders_status", dateCol: "orders_date", placeCol: "orders_place", linkCol: "orders_id", db: RECEIVED },
} as const;
type SacKey = keyof typeof SACRAMENTS;
const STATE_RANK: Record<State, number> = { here: 3, elsewhere: 2, not_yet: 1, unsure: 0 };

const nz = (v: unknown): string | null => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const has = (v: unknown) => v !== null && v !== undefined && v !== "" && v !== 0;
const year = (r: Row): number | null => (has(r.date_of_birth_year) ? Number(r.date_of_birth_year) : null);
const stateOf = (k: SacKey, stored: unknown): State => {
  const db = SACRAMENTS[k].db as Record<State, string>;
  return (Object.keys(db) as State[]).find((s) => db[s] === stored) ?? "unsure";
};
const isReceived = (k: SacKey, stored: unknown) => ["here", "elsewhere"].includes(stateOf(k, stored));
const receivedCount = (r: Row) => (Object.keys(SACRAMENTS) as SacKey[]).filter((k) => isReceived(k, r[SACRAMENTS[k].statusCol])).length;

export interface Assessment { tier: Tier; reasons: string[]; blocker: string | null; auto: boolean }

/** null = these are NOT plausibly the same person (different name, contradictory birth year, or different parents). */
export function assess(a: Row, b: Row): Assessment | null {
  const reasons: string[] = [];
  if (sameName(a.full_name as string, b.full_name as string)) reasons.push("Same name");
  else if (looksLikeSamePerson(a.full_name as string, b.full_name as string)) reasons.push("Name written differently");
  else return null;
  const ya = year(a), yb = year(b);
  if (!birthYearsCompatible(ya, yb)) return null;
  const matched: string[] = [];
  for (const who of ["father", "mother"] as const) {
    const na = nz(a[`${who}_name`]), nb = nz(b[`${who}_name`]);
    if (na !== null && nb !== null) {
      if (!parentsCompatible(na, nb)) return null; // different parents: two different people
      matched.push(who);
    }
  }
  const sameYear = ya !== null && ya === yb;
  let tier: Tier;
  if (matched.length === 2) { tier = "same_parents"; reasons.push("Father's and mother's names match"); }
  else if (matched.length || sameYear) { tier = "likely"; if (matched.length) reasons.push(`${matched[0]![0]!.toUpperCase()}${matched[0]!.slice(1)}'s name matches`); }
  else { tier = "name_only"; reasons.push("Nothing else recorded to confirm it"); }
  if (sameYear) reasons.push("Same year of birth");
  const blk = blocker(a, b);
  return { tier, reasons, blocker: blk, auto: tier === "same_parents" && blk === null && (ya === null || yb === null || ya === yb) };
}

/** A reason these two must NOT be merged automatically (they point at two different register entries, or differ in sex). */
export function blocker(a: Row, b: Row): string | null {
  const labels: Record<string, string> = { baptism_id: "Baptism", communion_id: "First Communion", confirmation_id: "Confirmation", orders_id: "Holy Orders", marriage_spouse_id: "Holy Matrimony", matrimony_id: "Holy Matrimony" };
  for (const [col, label] of Object.entries(labels)) {
    if (has(a[col]) && has(b[col]) && Number(a[col]) !== Number(b[col])) return `They are linked to two different ${label} register entries. Resolve the register entries first (archive the wrong one), then merge.`;
  }
  if (has(a.sex) && has(b.sex) && a.sex !== b.sex) return "Their recorded sex differs.";
  return null;
}

/** The fuller record survives: more register links, then more filled-in details, then the older id. */
export function chooseKeeper(a: Row, b: Row): [keep: Row, drop: Row] {
  const score = (r: Row) => {
    let s = 0;
    for (const c of LINK_COLUMNS) s += has(r[c]) ? 10 : 0;
    for (const c of ["residence", "phone", "father_name", "mother_name", "sex", "occupation", "household_id", "outstation_id", "date_of_birth_year", "notes"]) s += nz(r[c]) !== null ? 1 : 0;
    return s + receivedCount(r) * 2 + (r.data_source === "manual" ? 1 : 0);
  };
  const sa = score(a), sb = score(b);
  if (sa !== sb) return sa > sb ? [a, b] : [b, a];
  return Number(a.id) <= Number(b.id) ? [a, b] : [b, a];
}

/** What the survivor gains and how the absorbed row is retired (archived, links released). Never overwrites a value the survivor already has. */
export function combine(keep: Row, drop: Row, today: string): { keep: Row; drop: Row } {
  const k: Row = {};
  if (tokens(drop.full_name as string).length > tokens(keep.full_name as string).length) k.full_name = drop.full_name;
  for (const c of ["sex", "residence", "phone", "occupation", "household_id", "outstation_id", "death_id", "spouse_name", "confirmation_name", "orders_type"]) {
    if (nz(keep[c]) === null && nz(drop[c]) !== null) k[c] = drop[c];
  }
  if (!has(keep.date_of_birth_year) && has(drop.date_of_birth_year)) {
    k.date_of_birth_year = drop.date_of_birth_year; k.date_of_birth_month = drop.date_of_birth_month ?? null; k.date_of_birth_day = drop.date_of_birth_day ?? null; k.dob_estimated = Number(drop.dob_estimated ?? 0);
  } else if (has(keep.date_of_birth_year) && has(drop.date_of_birth_year) && Number(keep.date_of_birth_year) === Number(drop.date_of_birth_year)) {
    for (const c of ["date_of_birth_month", "date_of_birth_day"]) if (!has(keep[c]) && has(drop[c])) k[c] = drop[c];
    if (has(keep.dob_estimated) && !has(drop.dob_estimated) && has(drop.date_of_birth_month)) k.dob_estimated = 0;
  }
  for (const who of ["father", "mother"] as const) {
    const keepHas = nz(keep[`${who}_name`]) !== null, dropHas = nz(drop[`${who}_name`]) !== null;
    if (!keepHas && dropHas) { k[`${who}_name`] = drop[`${who}_name`]; k[`${who}_unknown`] = 0; }
    else if (!keepHas && !has(keep[`${who}_unknown`]) && has(drop[`${who}_unknown`])) k[`${who}_unknown`] = 1;
  }
  const plain = (v: unknown) => v === null || v === undefined || v === "" || v === "single";
  if (plain(keep.marital_status) && !plain(drop.marital_status)) k.marital_status = drop.marital_status;
  if ((keep.practising_status ?? "unknown") === "unknown" && (drop.practising_status ?? "unknown") !== "unknown") k.practising_status = drop.practising_status;
  if ((drop.residency_status ?? "resident") === "deceased" && (keep.residency_status ?? "") !== "deceased") k.residency_status = "deceased";

  for (const key of Object.keys(SACRAMENTS) as SacKey[]) {
    const def = SACRAMENTS[key];
    const sk = stateOf(key, keep[def.statusCol]), sd = stateOf(key, drop[def.statusCol]);
    const rank = (s: State, row: Row) => STATE_RANK[s] * 2 + (has(row[def.linkCol]) ? 1 : 0);
    const dropWins = rank(sd, drop) > rank(sk, keep);
    const win = dropWins ? drop : keep, lose = dropWins ? keep : drop;
    if (dropWins) {
      k[def.statusCol] = drop[def.statusCol]; k[def.linkCol] = drop[def.linkCol] ?? null;
      if (key === "matrimony") k.marriage_spouse_id = drop.marriage_spouse_id ?? null;
    } else if (!has(keep[def.linkCol]) && has(drop[def.linkCol]) && sk === sd) {
      k[def.linkCol] = drop[def.linkCol];
      if (key === "matrimony") k.marriage_spouse_id = drop.marriage_spouse_id ?? null;
    }
    const loseReceived = isReceived(key, lose[def.statusCol]);
    for (const col of [def.dateCol, def.placeCol]) {
      let v = nz(win[col]);
      if (v === null && loseReceived) v = nz(lose[col]);
      if (v !== null && nz(keep[col]) !== v) k[col] = v;
    }
  }
  let notes = String(keep.notes ?? "").trim();
  const other = String(drop.notes ?? "").trim();
  if (other !== "" && !notes.includes(other)) notes = `${notes}\n${other}`.trim();
  k.notes = `${notes}\nMerged with duplicate #${drop.id} (${drop.full_name}) on ${today}.`.trim();
  if (keep.data_source === "registers" && drop.data_source === "manual") k.data_source = "manual";
  k.needs_review = 0; k.review_note = null;
  const d: Row = { is_archived: 1, needs_review: 0, review_note: null, notes: `${String(drop.notes ?? "").trim()}\nMerged into #${keep.id} (${keep.full_name}) on ${today}.`.trim() };
  for (const c of LINK_COLUMNS) d[c] = null; // released: the kept record owns every link now
  return { keep: k, drop: d };
}

export interface Pair extends Assessment { a: Row; b: Row; keep: Row; drop: Row }
const TIER_ORDER: Record<Tier, number> = { same_parents: 0, likely: 1, name_only: 2 };

/**
 * Candidate duplicate pairs among active rows. Rows are bucketed by name word so this is near-linear, not n². A pair needs
 * >=2 shared name words; `dismissed` holds "low-high" ids staff confirmed are different people.
 */
export function findPairs(rows: Row[], dismissed: Set<string>, limit = 1000): Pair[] {
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const words = new Map<string, number[]>();
  const toks = new Map<number, string[]>();
  for (const r of rows) {
    const t = tokens(r.full_name as string); toks.set(Number(r.id), t);
    for (const w of new Set(t)) { const l = words.get(w); l ? l.push(Number(r.id)) : words.set(w, [Number(r.id)]); }
  }
  const pairs: Pair[] = [];
  for (const [id, r] of byId) {
    const shared = new Map<number, number>();
    for (const w of new Set(toks.get(id))) for (const o of words.get(w) ?? []) if (o > id) shared.set(o, (shared.get(o) ?? 0) + 1);
    for (const [other, count] of shared) {
      if (count < 2 || dismissed.has(`${id}-${other}`)) continue;
      const as = assess(r, byId.get(other)!);
      if (!as) continue;
      const [keep, drop] = chooseKeeper(r, byId.get(other)!);
      pairs.push({ a: r, b: byId.get(other)!, keep, drop, ...as });
    }
  }
  pairs.sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier] || String(x.a.full_name).localeCompare(String(y.a.full_name)));
  return pairs.slice(0, limit);
}
