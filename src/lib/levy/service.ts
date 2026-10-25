import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { categoryScope } from "@/lib/financials/repository";
import { toPesewas } from "@/lib/financials/money";
import { levyFor, validPercent } from "./rules";

const C = schema.financialCategories, R = schema.diocesanRemittances;
export class LevyError extends Error {}
export class LevyForbiddenError extends Error {}
const need = (u: SessionUser, p: "levy.view" | "levy.manage") => { if (!roleCan(u.role, p)) throw new LevyForbiddenError(); };

/** Scoped like Financials: a role walled off from a category there does not see its totals here either. */
async function scoped(u: SessionUser) { return categoryScope(u); }
const inScope = (scope: number[] | null) => (scope === null ? undefined : scope.length ? inArray(C.id, scope) : sql`1 = 0`);

export async function levyOverview(u: SessionUser, year: number) {
  need(u, "levy.view");
  const scope = await scoped(u);
  const rows = await db().select({
    id: C.id, name: C.name, percent: C.remitPercent,
    collected: sql<string>`coalesce((select sum(t.amount) from financial_transactions t where t.category_id = ${C.id} and t.is_archived = 0 and extract(year from t.transaction_date) = ${year}), 0)`,
    remitted: sql<string>`coalesce((select sum(r.amount_remitted) from diocesan_remittances r where r.category_id = ${C.id} and r.fiscal_year = ${year}), 0)`,
  }).from(C).where(and(eq(C.type, "income"), eq(C.remitToDiocese, 1), eq(C.isActive, 1), inScope(scope))).orderBy(asc(C.displayOrder), asc(C.name));
  const lines = rows.map((r) => ({ id: r.id, name: r.name, percent: r.percent === null ? null : Number(r.percent), collected: Number(r.collected), remitted: Number(r.remitted), ...levyFor({ collected: Number(r.collected), percent: r.percent === null ? null : Number(r.percent), remitted: Number(r.remitted) }) }));
  const history = await db().select({ r: R, category: C.name }).from(R).innerJoin(C, eq(C.id, R.categoryId)).where(and(eq(R.fiscalYear, year), inScope(scope))).orderBy(desc(R.remittedOn), desc(R.id));
  const all = roleCan(u.role, "levy.manage") ? await db().select({ id: C.id, name: C.name, flag: C.remitToDiocese, percent: C.remitPercent }).from(C).where(and(eq(C.type, "income"), eq(C.isActive, 1))).orderBy(asc(C.displayOrder), asc(C.name)) : [];
  const sum = (f: (l: (typeof lines)[number]) => number) => lines.reduce((s, l) => s + toPesewas(f(l)), 0) / 100;
  return { lines, history, all, totalDue: sum((l) => l.due), totalPaid: sum((l) => l.remitted) };
}

export async function recordRemittance(u: SessionUser, i: { categoryId: number; year: number; amount: number; date: string; reference: string | null; notes: string | null }): Promise<void> {
  need(u, "levy.manage");
  if (!(i.amount > 0)) throw new LevyError("Enter an amount greater than zero.");
  await db().transaction(async (tx) => {
    const [c] = await tx.select({ id: C.id }).from(C).where(and(eq(C.id, i.categoryId), eq(C.type, "income"), eq(C.remitToDiocese, 1))).limit(1);
    if (!c) throw new LevyError("Choose a category flagged for remittance.");
    const [row] = await tx.insert(R).values({ categoryId: i.categoryId, fiscalYear: i.year, amountRemitted: i.amount.toFixed(2), remittedOn: i.date, referenceNo: i.reference?.slice(0, 150) ?? null, remittedBy: u.username, notes: i.notes?.slice(0, 500) ?? null }).returning({ id: R.id });
    await logAudit({ table: "diocesan_remittances", recordId: row!.id, action: "create", username: u.username, details: `GHS ${i.amount.toFixed(2)} on ${i.date}` }, tx);
  });
}

/** Deleting a payment keeps the whole row in the audit trail (so it can be reconstructed). */
export async function deleteRemittance(u: SessionUser, id: number): Promise<void> {
  need(u, "levy.manage");
  await db().transaction(async (tx) => {
    const [r] = await tx.select().from(R).where(eq(R.id, id)).limit(1);
    if (!r) return;
    await logAudit({ table: "diocesan_remittances", recordId: id, action: "delete", username: u.username, details: r }, tx);
    await tx.delete(R).where(eq(R.id, id));
  });
}

export async function saveLevyCategories(u: SessionUser, form: { flagged: Set<number>; percents: Map<number, string> }): Promise<void> {
  need(u, "levy.manage");
  await db().transaction(async (tx) => {
    const incomes = await tx.select({ id: C.id }).from(C).where(eq(C.type, "income"));
    for (const { id } of incomes) {
      const p = validPercent(form.percents.get(id) ?? "");
      if (!p.ok) throw new LevyError("Percentages must be between 0 and 100.");
      await tx.update(C).set({ remitToDiocese: form.flagged.has(id) ? 1 : 0, remitPercent: p.value === null ? null : p.value.toFixed(2) }).where(eq(C.id, id));
    }
    await logAudit({ table: "financial_categories", recordId: 0, action: "update", username: u.username, details: "levy categories" }, tx);
  });
}
