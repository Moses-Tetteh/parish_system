import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { fmtMoney } from "@/lib/financials/money";

export type ReportRow = [item: string, value: string | number, note?: string];
export interface ReportSection { title: string; rows: ReportRow[] }
export interface AnnualReport { year: number; sections: ReportSection[] }

type Rows = Record<string, unknown>[];
const q = async (query: ReturnType<typeof sql>): Promise<Rows> => (await db().execute(query)) as unknown as Rows;
const n = async (query: ReturnType<typeof sql>): Promise<number> => Number(Object.values((await q(query))[0] ?? {})[0] ?? 0);
/** Table/column names come from this file only (never from input), so interpolating them with sql.raw is safe. */
const countIn = (table: string, col: string, year: number, extra = "") => n(sql`select count(*) from ${sql.raw(table)} where is_archived = 0 and extract(year from ${sql.raw(col)}) = ${year} ${sql.raw(extra)}`);

/** The statistical return, built live from the registers (port of AnnualReportService). Finance appears only for roles that may see it. */
export async function buildAnnualReport(year: number, includeFinance: boolean): Promise<AnnualReport> {
  const s: ReportSection[] = [];

  const bands = { infant: 0, child: 0, adult: 0, unknown: 0 };
  for (const r of await q(sql`select case when date_of_birth_year is null then 'unknown' when extract(year from date_of_baptism) - date_of_birth_year < 7 then 'infant' when extract(year from date_of_baptism) - date_of_birth_year < 14 then 'child' else 'adult' end as band, count(*) n
      from baptism_records where is_archived = 0 and extract(year from date_of_baptism) = ${year} group by 1`)) bands[r.band as keyof typeof bands] = Number(r.n);
  s.push({ title: "Baptisms", rows: [["Total baptisms", bands.infant + bands.child + bands.adult + bands.unknown], ["Infants (under 7)", bands.infant], ["Children (7–13)", bands.child], ["Adults (14 and over)", bands.adult], ["Age not recorded", bands.unknown, "Counted from year of birth; add birth years to classify these."]] });

  s.push({ title: "Other sacraments", rows: [
    ["First Holy Communions", await countIn("communion_records", "date_of_communion", year)],
    ["Confirmations", await countIn("confirmation_records", "date_of_confirmation", year)],
    ["Anointing of the Sick / sick visits", await countIn("sick_calls", "visit_date", year, "and call_type in ('anointing','emergency')"), "Anointings only; see below for all pastoral visits."],
    ["Ordinations from the parish", await countIn("holy_orders", "ordination_date", year)],
  ] });

  const m = { catholic: 0, mixed_religion: 0, disparity_of_cult: 0, other: 0 } as Record<string, number>;
  for (const r of await q(sql`select marriage_type, count(*) n from matrimony_records where is_archived = 0 and extract(year from date_of_marriage) = ${year} group by 1`)) m[String(r.marriage_type)] = Number(r.n);
  s.push({ title: "Marriages", rows: [["Total marriages celebrated", Object.values(m).reduce((a, b) => a + b, 0)], ["Catholic – Catholic", m.catholic ?? 0], ["Mixed religion", m.mixed_religion ?? 0], ["Disparity of cult", m.disparity_of_cult ?? 0], ["Other", m.other ?? 0, "Set “Marriage Type” on each Matrimony record."]] });

  s.push({ title: "Funerals", rows: [["Deaths recorded", await countIn("death_records", "date_of_death", year)], ["Burials recorded in the burial register", await countIn("burial_records", "date_of_burial", year)]] });

  const v = new Map((await q(sql`select call_type, count(*) n from sick_calls where is_archived = 0 and extract(year from visit_date) = ${year} group by 1`)).map((r) => [String(r.call_type), Number(r.n)]));
  const g = (k: string) => v.get(k) ?? 0;
  s.push({ title: "Pastoral care of the sick", rows: [["Anointing of the Sick", g("anointing") + g("emergency")], ["Viaticum", g("viaticum")], ["Home Communion visits", g("home_communion")], ["Pastoral visits & confessions", g("pastoral_visit") + g("confession")], ["Total visits", [...v.values()].reduce((a, b) => a + b, 0)]] });

  const mass = (await q(sql`select count(*) n, coalesce(sum(stipend_amount), 0) total from mass_intentions where is_archived = 0 and status = 'celebrated' and extract(year from mass_date) = ${year}`))[0]!;
  const owed = await n(sql`select count(*) from mass_intentions where is_archived = 0 and status = 'booked' and extract(year from mass_date) = ${year} and mass_date < current_date`);
  s.push({ title: "Mass intentions", rows: [["Intentions celebrated", Number(mass.n)], ["Stipends for celebrated Masses (GHS)", fmtMoney(mass.total)], ["Masses still owed from this year", owed, owed ? "Celebrate or transfer these before reporting." : ""]] });

  const resident = await n(sql`select count(*) from parishioners where is_archived = 0 and residency_status = 'resident'`);
  s.push({ title: "The faithful (census today)", rows: [
    ["Catholics on the parish census", resident, resident === 0 ? "The census is empty — run “Sync from registers” on the Parishioners page." : ""],
    ["Of whom practising", await n(sql`select count(*) from parishioners where is_archived = 0 and residency_status = 'resident' and practising_status = 'practising'`)],
    ["Households", await n(sql`select count(*) from households where is_archived = 0`)], ["Outstations", await n(sql`select count(*) from outstations where is_archived = 0`)],
  ] });

  s.push({ title: "Pastoral workers", rows: [
    ["Priests serving the parish (31 Dec)", await n(sql`select count(*) from parish_priests where is_archived = 0 and (date_of_arrival is null or date_of_arrival <= ${`${year}-12-31`}::date) and (date_of_departure is null or date_of_departure > ${`${year}-12-31`}::date)`)],
    ["Catechists", await n(sql`select count(*) from catechesis_teachers where is_archived = 0 and (starting_year is null or starting_year <= ${year}) and (ending_year is null or ending_year >= ${year})`)],
  ] });

  const groups = await q(sql`select s.group_type, count(distinct s.id) groups_n, count(m.id) members from societies s left join society_members m on m.society_id = s.id and m.left_on is null where s.is_archived = 0 group by 1 order by 1`);
  const tg = groups.reduce((a, r) => a + Number(r.groups_n), 0), tm = groups.reduce((a, r) => a + Number(r.members), 0);
  s.push({ title: "Societies and groups", rows: [["Societies & groups (total) / members", `${tg} / ${tm}`], ...groups.map((r): ReportRow => [`${String(r.group_type)} — groups / members`, `${r.groups_n} / ${r.members}`])] });

  const p = new Map((await q(sql`select program, count(*) n from sacrament_candidates where is_archived = 0 and extract(year from promoted_on) = ${year} and candidate_status = 'promoted' group by 1`)).map((r) => [String(r.program), Number(r.n)]));
  s.push({ title: "Sacramental preparation completed", rows: [["Baptism candidates (children / adults)", `${p.get("baptism_child") ?? 0} / ${p.get("baptism_adult") ?? 0}`], ["First Communion classes", p.get("first_communion") ?? 0], ["Confirmation classes", p.get("confirmation") ?? 0], ["RCIA", p.get("rcia") ?? 0]] });

  if (includeFinance) {
    const f = new Map((await q(sql`select c.type, coalesce(sum(t.amount), 0) total from financial_transactions t join financial_categories c on c.id = t.category_id where t.is_archived = 0 and extract(year from t.transaction_date) = ${year} group by 1`)).map((r) => [String(r.type), Number(r.total)]));
    const inc = f.get("income") ?? 0, exp = f.get("expense") ?? 0;
    const remitted = await n(sql`select coalesce(sum(amount_remitted), 0) from diocesan_remittances where fiscal_year = ${year}`);
    s.push({ title: "Finances (GHS)", rows: [["Total income", fmtMoney(inc)], ["Total expenditure", fmtMoney(exp)], ["Surplus / (deficit)", fmtMoney(Math.round((inc - exp) * 100) / 100)], ["Remitted to the diocese", fmtMoney(remitted)]] });
  }
  return { year, sections: s };
}

export const canIncludeFinance = (u: SessionUser) => roleCan(u.role, "levy.view");
