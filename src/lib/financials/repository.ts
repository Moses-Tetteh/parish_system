import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema, type Executor } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { allocateWaterfall, expectedAmountFor, statusFor, type DuesStatus } from "./dues";
import { fromPesewas, toPesewas } from "./money";
import { amountToWords } from "./words";
import type { TxFilters } from "./period";

const S = schema;

export class FinanceForbiddenError extends Error {
  constructor(msg = "You do not have permission to do that.") { super(msg); }
}
export class FinanceInputError extends Error {}

/** Postgres unique_violation (23505), however deep the driver/ORM wrapped it. */
export function isUniqueViolation(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; i++, x = (x as { cause?: unknown }).cause) if ((x as { code?: string }).code === "23505") return true;
  return false;
}

export function assertCan(user: SessionUser, p: "financials.core" | "financials.transactions" | "financials.members"): void {
  if (!roleCan(user.role, p)) throw new FinanceForbiddenError();
}

/* ------------------------------------------------------------------ role scope */

/**
 * Port of financial_category_scope(): the PPC Secretary sees ONLY dues/offering categories; the main
 * Secretary sees everything EXCEPT those; priest/admin are unrestricted (null).
 * `[]` means "restricted to nothing" and must match no rows (never an invalid empty IN()).
 */
export async function categoryScope(user: SessionUser): Promise<number[] | null> {
  if (user.role !== "secretary" && user.role !== "ppc_secretary") return null;
  const restricted = (await db().select({ id: S.financialCategories.id }).from(S.financialCategories)
    .where(or(eq(S.financialCategories.isDuesCategory, 1), eq(S.financialCategories.isOfferingCategory, 1)))).map((r) => r.id);
  if (user.role === "ppc_secretary") return restricted;
  const all = (await db().select({ id: S.financialCategories.id }).from(S.financialCategories)).map((r) => r.id);
  const bad = new Set(restricted);
  return all.filter((id) => !bad.has(id));
}

const inScope = (scope: number[] | null, col: typeof S.financialTransactions.categoryId): SQL | undefined =>
  scope === null ? undefined : scope.length ? inArray(col, scope) : sql`1 = 0`;

/* ------------------------------------------------------------------ categories */

export type Category = typeof S.financialCategories.$inferSelect;

export async function listCategories(scope: number[] | null = null, activeOnly = false): Promise<Category[]> {
  const rows = await db().select().from(S.financialCategories)
    .where(and(activeOnly ? eq(S.financialCategories.isActive, 1) : undefined, scope === null ? undefined : scope.length ? inArray(S.financialCategories.id, scope) : sql`1 = 0`))
    .orderBy(asc(S.financialCategories.type), asc(S.financialCategories.displayOrder), asc(S.financialCategories.name));
  return rows;
}

export async function addCategory(user: SessionUser, name: string, type: "income" | "expense"): Promise<void> {
  assertCan(user, "financials.core");
  await db().transaction(async (tx) => {
    const [row] = await tx.insert(S.financialCategories).values({ name, type, isActive: 1, displayOrder: 999 }).returning({ id: S.financialCategories.id });
    await logAudit({ table: "financial_categories", recordId: row!.id, action: "create", username: user.username, details: { name, type } }, tx);
  });
}

type CategoryPatch = Partial<typeof S.financialCategories.$inferInsert>;
async function patchCategory(user: SessionUser, id: number, patch: CategoryPatch, detail: unknown): Promise<void> {
  assertCan(user, "financials.core");
  await db().transaction(async (tx) => {
    await tx.update(S.financialCategories).set(patch).where(eq(S.financialCategories.id, id));
    await logAudit({ table: "financial_categories", recordId: id, action: "update", username: user.username, details: detail }, tx);
  });
}

export const setCategoryActive = (u: SessionUser, id: number, active: boolean) => patchCategory(u, id, { isActive: active ? 1 : 0 }, { active });
export const setCategoryOffering = (u: SessionUser, id: number, on: boolean) => patchCategory(u, id, { isOfferingCategory: on ? 1 : 0 }, { offering: on });
export const setCategoryDues = (u: SessionUser, id: number, on: boolean, annual: number | null) =>
  patchCategory(u, id, { isDuesCategory: on ? 1 : 0, annualDuesAmount: on && annual !== null ? annual.toFixed(2) : null }, { dues: on, annual });
export const setCategoryTiers = (u: SessionUser, id: number, on: boolean, child: number | null, youth: number | null, adult: number | null) =>
  patchCategory(u, id, {
    isTiered: on ? 1 : 0,
    tierChildAmount: on && child !== null ? child.toFixed(2) : null,
    tierYouthAmount: on && youth !== null ? youth.toFixed(2) : null,
    tierAdultAmount: on && adult !== null ? adult.toFixed(2) : null,
  }, { tiered: on, child, youth, adult });

/* ------------------------------------------------------------------ transactions */

export interface TxRow {
  id: number; categoryId: number; categoryName: string; categoryType: "income" | "expense";
  costCenterAccount: string | null; transactionDate: string; pvNo: string | null; paymentMethod: string | null;
  invoiceDate: string | null; amount: number; amountInWords: string | null; description: string | null;
  approvedBy: string | null; preparedBy: string | null; receivedBy: string | null; receivedDate: string | null;
  isArchived: number; updatedAt: string | null; runningBalance?: number;
}

const TX_COLS = {
  id: S.financialTransactions.id, categoryId: S.financialTransactions.categoryId,
  categoryName: S.financialCategories.name, categoryType: S.financialCategories.type,
  costCenterAccount: S.financialTransactions.costCenterAccount, transactionDate: S.financialTransactions.transactionDate,
  pvNo: S.financialTransactions.pvNo, paymentMethod: S.financialTransactions.paymentMethod, invoiceDate: S.financialTransactions.invoiceDate,
  amount: S.financialTransactions.amount, amountInWords: S.financialTransactions.amountInWords, description: S.financialTransactions.description,
  approvedBy: S.financialTransactions.approvedBy, preparedBy: S.financialTransactions.preparedBy, receivedBy: S.financialTransactions.receivedBy,
  receivedDate: S.financialTransactions.receivedDate, isArchived: S.financialTransactions.isArchived, updatedAt: S.financialTransactions.updatedAt,
};
const toTx = (r: Record<string, unknown>): TxRow => ({ ...(r as unknown as TxRow), amount: Number(r.amount), categoryType: r.categoryType as "income" | "expense" });

export const TX_LIST_CAP = 5000;

export async function searchTransactions(user: SessionUser, f: TxFilters, cap = TX_LIST_CAP): Promise<TxRow[]> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  const rows = await db().select(TX_COLS).from(S.financialTransactions)
    .innerJoin(S.financialCategories, eq(S.financialCategories.id, S.financialTransactions.categoryId))
    .where(and(
      eq(S.financialTransactions.isArchived, f.archived ? 1 : 0),
      f.start ? gte(S.financialTransactions.transactionDate, f.start) : undefined,
      f.end ? lte(S.financialTransactions.transactionDate, f.end) : undefined,
      f.type ? eq(S.financialCategories.type, f.type) : undefined,
      f.category ? eq(S.financialTransactions.categoryId, f.category) : undefined,
      inScope(scope, S.financialTransactions.categoryId),
    ))
    .orderBy(desc(S.financialTransactions.transactionDate), desc(S.financialTransactions.id)).limit(cap);
  return rows.map(toTx);
}

/** One transaction; refused (null) if its category is outside the caller's scope. */
export async function getTransaction(user: SessionUser, id: number): Promise<TxRow | null> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  const [row] = await db().select(TX_COLS).from(S.financialTransactions)
    .innerJoin(S.financialCategories, eq(S.financialCategories.id, S.financialTransactions.categoryId))
    .where(and(eq(S.financialTransactions.id, id), inScope(scope, S.financialTransactions.categoryId))).limit(1);
  return row ? toTx(row) : null;
}

export async function suggestNextPvNo(year: string): Promise<string> {
  const rows = await db().select({ pv: S.financialTransactions.pvNo }).from(S.financialTransactions)
    .where(sql`${S.financialTransactions.pvNo} like ${`PV-${year}-%`}`).orderBy(desc(S.financialTransactions.id)).limit(50);
  let max = 0;
  const re = new RegExp(`^PV-${year}-(\\d+)$`);
  for (const r of rows) { const m = re.exec(r.pv ?? ""); if (m) max = Math.max(max, Number(m[1])); }
  return `PV-${year}-${String(max + 1).padStart(4, "0")}`;
}

export interface TxInput {
  categoryId: number; costCenterAccount: string | null; transactionDate: string; pvNo: string | null;
  paymentMethod: "cash" | "cheque" | null; invoiceDate: string | null; amount: number; amountInWords: string | null;
  description: string | null; approvedBy: string | null; preparedBy: string | null; receivedBy: string | null; receivedDate: string | null;
}

/** Create / update. Enforces the role scope on BOTH the chosen category and (for edits) the existing one. */
export async function saveTransaction(user: SessionUser, id: number | null, input: TxInput, version?: string): Promise<{ id: number } | "conflict"> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  if (scope !== null && !scope.includes(input.categoryId)) throw new FinanceForbiddenError("You do not have permission to use that General Ledger Account.");
  const [cat] = await db().select({ id: S.financialCategories.id }).from(S.financialCategories).where(eq(S.financialCategories.id, input.categoryId)).limit(1);
  if (!cat) throw new FinanceInputError("Unknown General Ledger Account.");

  const values = {
    categoryId: input.categoryId, costCenterAccount: input.costCenterAccount, transactionDate: input.transactionDate, pvNo: input.pvNo,
    paymentMethod: input.paymentMethod, invoiceDate: input.invoiceDate, amount: input.amount.toFixed(2),
    amountInWords: input.amountInWords ?? amountToWords(input.amount), description: input.description,
    approvedBy: input.approvedBy, preparedBy: input.preparedBy, receivedBy: input.receivedBy, receivedDate: input.receivedDate,
    updatedBy: user.username,
  };
  return db().transaction(async (tx) => {
    if (id === null) {
      const [row] = await tx.insert(S.financialTransactions).values({ ...values, createdBy: user.username }).returning({ id: S.financialTransactions.id });
      await logAudit({ table: "financial_transactions", recordId: row!.id, action: "create", username: user.username, details: values }, tx);
      return { id: row!.id };
    }
    const [existing] = await tx.select({ categoryId: S.financialTransactions.categoryId }).from(S.financialTransactions).where(eq(S.financialTransactions.id, id)).limit(1);
    if (!existing) return "conflict" as const;
    if (scope !== null && !scope.includes(existing.categoryId)) throw new FinanceForbiddenError("You do not have permission to edit this transaction.");
    const guard: SQL[] = [eq(S.financialTransactions.id, id)];
    if (version !== undefined) guard.push(version === "" ? sql`${S.financialTransactions.updatedAt} is null` : sql`${S.financialTransactions.updatedAt} = ${version}::timestamptz`);
    const rows = await tx.update(S.financialTransactions).set(values).where(and(...guard)).returning({ id: S.financialTransactions.id });
    if (!rows.length) return "conflict" as const;
    await logAudit({ table: "financial_transactions", recordId: id, action: "update", username: user.username, details: values }, tx);
    return { id };
  });
}

export async function setTransactionArchived(user: SessionUser, id: number, archived: boolean): Promise<void> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  await db().transaction(async (tx) => {
    const [row] = await tx.select({ c: S.financialTransactions.categoryId }).from(S.financialTransactions).where(eq(S.financialTransactions.id, id)).limit(1);
    if (!row) return;
    if (scope !== null && !scope.includes(row.c)) throw new FinanceForbiddenError("You do not have permission to modify this transaction.");
    await tx.update(S.financialTransactions).set({ isArchived: archived ? 1 : 0, updatedBy: user.username }).where(eq(S.financialTransactions.id, id));
    await logAudit({ table: "financial_transactions", recordId: id, action: archived ? "archive" : "restore", username: user.username }, tx);
  });
}

/* ------------------------------------------------------------------ ledger + statement */

/** Net (income − expense) of every active transaction strictly before `date`, within the same scope as the rows shown. */
export async function netBalanceBefore(user: SessionUser, date: string): Promise<number> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  const [row] = await db().select({ n: sql<string>`coalesce(sum(case when ${S.financialCategories.type} = 'income' then ${S.financialTransactions.amount} else -${S.financialTransactions.amount} end), 0)` })
    .from(S.financialTransactions).innerJoin(S.financialCategories, eq(S.financialCategories.id, S.financialTransactions.categoryId))
    .where(and(eq(S.financialTransactions.isArchived, 0), lt(S.financialTransactions.transactionDate, date), inScope(scope, S.financialTransactions.categoryId)));
  return Number(row?.n ?? 0);
}

export async function ledgerForRange(user: SessionUser, start: string, end: string): Promise<{ opening: number; rows: TxRow[]; debit: number; credit: number; closing: number }> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  const opening = toPesewas(await netBalanceBefore(user, start));
  const raw = await db().select(TX_COLS).from(S.financialTransactions)
    .innerJoin(S.financialCategories, eq(S.financialCategories.id, S.financialTransactions.categoryId))
    .where(and(eq(S.financialTransactions.isArchived, 0), gte(S.financialTransactions.transactionDate, start), lte(S.financialTransactions.transactionDate, end), inScope(scope, S.financialTransactions.categoryId)))
    .orderBy(asc(S.financialTransactions.transactionDate), asc(S.financialTransactions.id)).limit(TX_LIST_CAP);
  let bal = opening, debit = 0, credit = 0;
  const rows = raw.map((r) => {
    const t = toTx(r); const p = toPesewas(t.amount);
    if (t.categoryType === "income") { bal += p; credit += p; } else { bal -= p; debit += p; }
    return { ...t, runningBalance: fromPesewas(bal) };
  });
  return { opening: fromPesewas(opening), rows, debit: fromPesewas(debit), credit: fromPesewas(credit), closing: fromPesewas(bal) };
}

export interface CategoryTotal { categoryId: number; categoryName: string; total: number }

export async function totalsByCategory(start: string, end: string, type: "income" | "expense", scope: number[] | null): Promise<CategoryTotal[]> {
  const rows = await db().select({ categoryId: S.financialCategories.id, categoryName: S.financialCategories.name, total: sql<string>`coalesce(sum(${S.financialTransactions.amount}), 0)` })
    .from(S.financialCategories)
    .leftJoin(S.financialTransactions, and(eq(S.financialTransactions.categoryId, S.financialCategories.id), eq(S.financialTransactions.isArchived, 0), gte(S.financialTransactions.transactionDate, start), lte(S.financialTransactions.transactionDate, end)))
    .where(and(eq(S.financialCategories.type, type), eq(S.financialCategories.isActive, 1), scope === null ? undefined : scope.length ? inArray(S.financialCategories.id, scope) : sql`1 = 0`))
    .groupBy(S.financialCategories.id, S.financialCategories.name, S.financialCategories.displayOrder)
    .orderBy(asc(S.financialCategories.displayOrder), asc(S.financialCategories.name));
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export interface Statement { start: string; end: string; income: CategoryTotal[]; expense: CategoryTotal[]; totalIncome: number; totalExpense: number; net: number }

/** Totals AND net are recomputed from only the rows in scope, so a restricted role never sees a hidden category in a total. */
export async function buildStatement(user: SessionUser, start: string, end: string): Promise<Statement> {
  assertCan(user, "financials.transactions");
  const scope = await categoryScope(user);
  const [income, expense] = await Promise.all([totalsByCategory(start, end, "income", scope), totalsByCategory(start, end, "expense", scope)]);
  const sum = (a: CategoryTotal[]) => fromPesewas(a.reduce((s, r) => s + toPesewas(r.total), 0));
  const totalIncome = sum(income), totalExpense = sum(expense);
  return { start, end, income, expense, totalIncome, totalExpense, net: fromPesewas(toPesewas(totalIncome) - toPesewas(totalExpense)) };
}

/* ------------------------------------------------------------------ members + dues */

export type Member = typeof S.members.$inferSelect;

export async function listMembers(user: SessionUser, archived: boolean, q = ""): Promise<Member[]> {
  assertCan(user, "financials.members");
  const like = q.trim() ? sql`${S.members.fullName} ilike ${`%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`}` : undefined;
  return db().select().from(S.members).where(and(eq(S.members.isArchived, archived ? 1 : 0), like)).orderBy(asc(S.members.fullName)).limit(2000);
}

export interface MemberInput { fullName: string; household: string | null; memberTier: "child" | "youth" | "adult"; contact: string | null; memberSince: number | null; notes: string | null }

export async function saveMember(user: SessionUser, id: number | null, m: MemberInput): Promise<void> {
  assertCan(user, "financials.members");
  await db().transaction(async (tx) => {
    if (id === null) {
      const [r] = await tx.insert(S.members).values({ ...m, createdBy: user.username, updatedBy: user.username }).returning({ id: S.members.id });
      await logAudit({ table: "members", recordId: r!.id, action: "create", username: user.username, details: m }, tx);
    } else {
      await tx.update(S.members).set({ ...m, updatedBy: user.username }).where(eq(S.members.id, id));
      await logAudit({ table: "members", recordId: id, action: "update", username: user.username, details: m }, tx);
    }
  });
}

export async function setMemberArchived(user: SessionUser, id: number, archived: boolean): Promise<void> {
  assertCan(user, "financials.members");
  await db().transaction(async (tx) => {
    await tx.update(S.members).set({ isArchived: archived ? 1 : 0, updatedBy: user.username }).where(eq(S.members.id, id));
    await logAudit({ table: "members", recordId: id, action: archived ? "archive" : "restore", username: user.username }, tx);
  });
}

export async function activeDuesCategories(): Promise<Category[]> {
  return db().select().from(S.financialCategories)
    .where(and(eq(S.financialCategories.type, "income"), eq(S.financialCategories.isActive, 1), eq(S.financialCategories.isDuesCategory, 1)))
    .orderBy(asc(S.financialCategories.displayOrder), asc(S.financialCategories.name));
}

const sinceYearOf = (m: Member): number => m.memberSince || Number(String(m.createdAt).slice(0, 4)) || new Date().getUTCFullYear();

export interface DuesRow {
  memberId: number; fullName: string; household: string | null; tier: string;
  expected: number; paid: number; balanceThisYear: number; status: DuesStatus; totalArrears: number; totalAdvance: number;
}

/** The Dues page table for one category + year: this year's coverage after older years are settled first. */
export async function duesStatusReport(user: SessionUser, categoryId: number, fiscalYear: number): Promise<DuesRow[]> {
  assertCan(user, "financials.members");
  const cat = (await activeDuesCategories()).find((c) => c.id === categoryId);
  if (!cat) return [];
  const members = await db().select().from(S.members).where(eq(S.members.isArchived, 0)).orderBy(asc(S.members.fullName));
  const pays = await db().select({ m: S.duesPayments.memberId, paid: sql<string>`sum(${S.duesPayments.amountPaid})` }).from(S.duesPayments)
    .where(and(eq(S.duesPayments.categoryId, categoryId), eq(S.duesPayments.isArchived, 0))).groupBy(S.duesPayments.memberId);
  const paidBy = new Map(pays.map((p) => [p.m, toPesewas(p.paid)]));

  return members.map((m) => {
    const expected = expectedAmountFor({ ...cat, isTiered: cat.isTiered === 1 }, m.memberTier);
    const w = allocateWaterfall(expected, paidBy.get(m.id) ?? 0, sinceYearOf(m), fiscalYear);
    const y = w.years[fiscalYear] ?? { expected, paid: 0, balance: expected };
    return {
      memberId: m.id, fullName: m.fullName, household: m.household, tier: m.memberTier,
      expected: fromPesewas(expected), paid: fromPesewas(y.paid), balanceThisYear: fromPesewas(y.balance),
      status: statusFor(y.paid, y.balance), totalArrears: fromPesewas(w.arrears), totalAdvance: fromPesewas(w.advance),
    };
  });
}

/**
 * Records a payment and the matching ledger line in ONE transaction. dues_payments is unique on
 * (member, category, fiscal_year), so a second instalment for the same year accumulates into that row.
 */
export async function recordDuesPayment(user: SessionUser, p: { memberId: number; categoryId: number; fiscalYear: number; amount: number; date: string; notes: string | null }): Promise<void> {
  assertCan(user, "financials.members");
  if (!(p.amount > 0)) throw new FinanceInputError("Enter an amount greater than zero.");
  const cat = (await activeDuesCategories()).find((c) => c.id === p.categoryId);
  if (!cat) throw new FinanceInputError("That category is not marked as a dues category.");
  const amount = (toPesewas(p.amount) / 100).toFixed(2);
  await db().transaction(async (tx: Executor) => {
    const [member] = await tx.select({ name: S.members.fullName }).from(S.members).where(and(eq(S.members.id, p.memberId), eq(S.members.isArchived, 0))).limit(1);
    if (!member) throw new FinanceInputError("Choose an active member.");
    const [row] = await tx.insert(S.duesPayments).values({
      memberId: p.memberId, categoryId: p.categoryId, fiscalYear: p.fiscalYear, amountPaid: amount, lastPaymentDate: p.date, notes: p.notes, createdBy: user.username, updatedBy: user.username,
    }).onConflictDoUpdate({
      target: [S.duesPayments.memberId, S.duesPayments.categoryId, S.duesPayments.fiscalYear],
      set: {
        amountPaid: sql`${S.duesPayments.amountPaid} + ${amount}::numeric`,
        lastPaymentDate: p.date,
        notes: sql`concat_ws(' | ', nullif(${S.duesPayments.notes}, ''), nullif(${p.notes ?? ""}::text, ''))`,
        updatedBy: user.username,
      },
    }).returning({ id: S.duesPayments.id });
    await logAudit({ table: "dues_payments", recordId: row!.id, action: "update", username: user.username, details: { payment: amount, year: p.fiscalYear, member_id: p.memberId } }, tx);
    const description = `Dues payment — ${member.name} (FY ${p.fiscalYear})`;
    const [t] = await tx.insert(S.financialTransactions).values({
      categoryId: p.categoryId, transactionDate: p.date, amount, amountInWords: amountToWords(Number(amount)), description, createdBy: user.username, updatedBy: user.username,
    }).returning({ id: S.financialTransactions.id });
    await logAudit({ table: "financial_transactions", recordId: t!.id, action: "create", username: user.username, details: { description, amount } }, tx);
  });
}

/* ------------------------------------------------------------------ budgets */

export interface BudgetLine { categoryId: number; categoryName: string; type: "income" | "expense"; amount: number }

export async function budgetYears(): Promise<number[]> {
  const rows = await db().selectDistinct({ y: S.budgets.fiscalYear }).from(S.budgets).orderBy(desc(S.budgets.fiscalYear));
  return rows.map((r) => r.y);
}

export async function budgetForYear(user: SessionUser, year: number): Promise<BudgetLine[]> {
  assertCan(user, "financials.core");
  const scope = await categoryScope(user);
  const rows = await db().select({ categoryId: S.budgets.categoryId, categoryName: S.financialCategories.name, type: S.financialCategories.type, amount: S.budgets.budgetedAmount })
    .from(S.budgets).innerJoin(S.financialCategories, eq(S.financialCategories.id, S.budgets.categoryId))
    .where(and(eq(S.budgets.fiscalYear, year), scope === null ? undefined : scope.length ? inArray(S.budgets.categoryId, scope) : sql`1 = 0`))
    .orderBy(asc(S.financialCategories.type), asc(S.financialCategories.displayOrder), asc(S.financialCategories.name));
  return rows.map((r) => ({ ...r, type: r.type as "income" | "expense", amount: Number(r.amount) }));
}

export interface SuggestedLine extends BudgetLine { referenceActual: number }

/** Trend-based suggestion: trailing 12 months of actuals × (1 + adjustment%). Nothing is saved until reviewed. */
export async function suggestBudget(user: SessionUser, adjustmentPercent: number, today: string): Promise<{ referenceStart: string; referenceEnd: string; lines: SuggestedLine[] }> {
  assertCan(user, "financials.core");
  const scope = await categoryScope(user);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 12); d.setUTCDate(d.getUTCDate() + 1);
  const referenceStart = d.toISOString().slice(0, 10);
  const lines: SuggestedLine[] = [];
  for (const type of ["income", "expense"] as const) {
    for (const r of await totalsByCategory(referenceStart, today, type, scope)) {
      const actual = toPesewas(r.total);
      lines.push({ categoryId: r.categoryId, categoryName: r.categoryName, type, referenceActual: fromPesewas(actual), amount: fromPesewas(Math.round(actual * (1 + adjustmentPercent / 100))) });
    }
  }
  return { referenceStart, referenceEnd: today, lines };
}

export async function saveBudget(user: SessionUser, year: number, amounts: Map<number, number>): Promise<number> {
  assertCan(user, "financials.core");
  const scope = await categoryScope(user);
  let saved = 0;
  await db().transaction(async (tx) => {
    for (const [categoryId, amount] of amounts) {
      if (scope !== null && !scope.includes(categoryId)) continue; // never trust a crafted field
      await tx.insert(S.budgets).values({ fiscalYear: year, categoryId, budgetedAmount: amount.toFixed(2), createdBy: user.username, updatedBy: user.username })
        .onConflictDoUpdate({ target: [S.budgets.fiscalYear, S.budgets.categoryId], set: { budgetedAmount: amount.toFixed(2), updatedBy: user.username } });
      saved++;
    }
    await logAudit({ table: "budgets", recordId: year, action: "update", username: user.username, details: { year, lines: saved } }, tx);
  });
  return saved;
}

export interface ComparisonLine { categoryName: string; budgeted: number; actual: number; variance: number }

export async function budgetComparison(user: SessionUser, year: number, today: string): Promise<{ actualThrough: string; income: ComparisonLine[]; expense: ComparisonLine[] }> {
  assertCan(user, "financials.core");
  const scope = await categoryScope(user);
  const lines = await budgetForYear(user, year);
  const yearEnd = `${year}-12-31`;
  const actualThrough = today < yearEnd ? today : yearEnd;
  const [inc, exp] = await Promise.all([totalsByCategory(`${year}-01-01`, actualThrough, "income", scope), totalsByCategory(`${year}-01-01`, actualThrough, "expense", scope)]);
  const actual = new Map([...inc, ...exp].map((r) => [r.categoryId, toPesewas(r.total)]));
  const out = { actualThrough, income: [] as ComparisonLine[], expense: [] as ComparisonLine[] };
  for (const l of lines) {
    const a = actual.get(l.categoryId) ?? 0, b = toPesewas(l.amount);
    out[l.type].push({ categoryName: l.categoryName, budgeted: l.amount, actual: fromPesewas(a), variance: fromPesewas(a - b) });
  }
  return out;
}

