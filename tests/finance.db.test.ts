/**
 * Runs the Financials repository against a REAL Postgres (migrations applied). Skipped unless TEST_DATABASE_URL is set:
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5433/parish DATABASE_SSL=disable SESSION_SECRET=<32+ chars> npm test
 * It truncates the finance tables first — point it ONLY at a throw-away database.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;
const user = (role: "admin" | "priest" | "secretary" | "ppc_secretary") => ({ id: 1, username: `${role}_t`, fullName: null, role });

describe.skipIf(!URL)("financials repository (real Postgres)", () => {
  let sql: ReturnType<typeof postgres>;
  let repo: typeof import("@/lib/financials/repository");
  const id: Record<string, number> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = URL; process.env.DATABASE_SSL = "disable";
    process.env.SESSION_SECRET ||= "0123456789abcdef0123456789abcdef0123";
    sql = postgres(URL!, { max: 2, onnotice: () => {} });
    await sql`truncate dues_payments, members, budgets, financial_transactions, financial_categories restart identity cascade`;
    const cat = async (name: string, type: string, extra: Record<string, unknown> = {}) =>
      Number((await sql`insert into financial_categories ${sql({ name, type, ...extra })} returning id`)[0]!.id);
    id.dues = await cat("Annual Church Dues", "income", { is_dues_category: 1, annual_dues_amount: "50.00" });
    id.offering = await cat("Sunday Offering", "income", { is_offering_category: 1 });
    id.donation = await cat("Donations", "income");
    id.fuel = await cat("Fuel", "expense");
    repo = await import("@/lib/financials/repository");
  });
  afterAll(async () => { await sql?.end(); });

  it("scopes categories by role: PPC = dues/offering only, Secretary = everything else, priest = unrestricted", async () => {
    expect((await repo.categoryScope(user("ppc_secretary")))!.sort()).toEqual([id.dues, id.offering].sort());
    expect((await repo.categoryScope(user("secretary")))!.sort()).toEqual([id.donation, id.fuel].sort());
    expect(await repo.categoryScope(user("priest"))).toBeNull();
  });

  it("refuses a transaction outside the caller's scope (create AND edit)", async () => {
    const base = { costCenterAccount: null, transactionDate: "2026-10-01", pvNo: null, paymentMethod: null, invoiceDate: null, amountInWords: null, description: "x", approvedBy: null, preparedBy: null, receivedBy: null, receivedDate: null };
    await expect(repo.saveTransaction(user("secretary"), null, { ...base, categoryId: id.offering!, amount: 10 })).rejects.toBeInstanceOf(repo.FinanceForbiddenError);
    const ok = await repo.saveTransaction(user("priest"), null, { ...base, categoryId: id.offering!, amount: 10 });
    expect(ok).toHaveProperty("id");
    const tid = (ok as { id: number }).id;
    await expect(repo.saveTransaction(user("secretary"), tid, { ...base, categoryId: id.donation!, amount: 1 })).rejects.toBeInstanceOf(repo.FinanceForbiddenError);
    expect(await repo.getTransaction(user("secretary"), tid)).toBeNull();   // hidden from the Secretary
    expect(await repo.getTransaction(user("ppc_secretary"), tid)).not.toBeNull();
  });

  it("members/dues pages are closed to the Secretary and core setup to the PPC Secretary", async () => {
    await expect(repo.listMembers(user("secretary"), false)).rejects.toBeInstanceOf(repo.FinanceForbiddenError);
    await expect(repo.addCategory(user("ppc_secretary"), "Hack", "income")).rejects.toBeInstanceOf(repo.FinanceForbiddenError);
  });

  it("records dues into one accumulating row, mirrors the ledger, and applies the waterfall", async () => {
    const ppc = user("ppc_secretary");
    await repo.saveMember(ppc, null, { fullName: "Akua Mensah", household: null, memberTier: "adult", contact: null, memberSince: 2024, notes: null });
    const [m] = await sql`select id from members where full_name = 'Akua Mensah'`;
    const pay = (amount: number, year: number) => repo.recordDuesPayment(ppc, { memberId: Number(m!.id), categoryId: id.dues!, fiscalYear: year, amount, date: "2026-10-05", notes: "n" });
    await pay(30, 2026); await pay(45, 2026);      // two instalments, same label year -> ONE row of 75
    const rows = await sql`select amount_paid from dues_payments where member_id = ${m!.id}`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount_paid)).toBe(75);
    const ledger = await sql`select amount from financial_transactions where description like 'Dues payment%' order by id`;
    expect(ledger.map((r) => Number(r.amount))).toEqual([30, 45]);

    const [r] = await repo.duesStatusReport(ppc, id.dues!, 2026);  // owes 2024+2025+2026 = 150, paid 75
    expect(r).toMatchObject({ expected: 50, paid: 0, balanceThisYear: 50, status: "Unpaid", totalArrears: 75, totalAdvance: 0 });
    await pay(100, 2020);                                            // an old-tagged lump sum is pooled and clears the oldest year first
    const [r2] = await repo.duesStatusReport(ppc, id.dues!, 2026);
    expect(r2).toMatchObject({ paid: 50, balanceThisYear: 0, status: "Paid", totalArrears: 0, totalAdvance: 25 }); // 175 paid vs 150 owed
  });

  it("keeps ledger balances and the statement coherent per role", async () => {
    const sec = user("secretary");
    const base = { costCenterAccount: null, transactionDate: "2026-11-02", pvNo: null, paymentMethod: null, invoiceDate: null, amountInWords: null, description: "d", approvedBy: null, preparedBy: null, receivedBy: null, receivedDate: null };
    await repo.saveTransaction(sec, null, { ...base, categoryId: id.donation!, amount: 200 });
    await repo.saveTransaction(sec, null, { ...base, categoryId: id.fuel!, amount: 80.5 });
    const l = await repo.ledgerForRange(sec, "2026-11-01", "2026-11-30");
    expect(l.opening).toBe(0);                    // Secretary never sees dues/offering rows, so the opening balance excludes them too
    expect(l.rows.map((r) => r.runningBalance)).toEqual([200, 119.5]);
    expect(l.closing).toBe(119.5);
    const st = await repo.buildStatement(sec, "2026-11-01", "2026-11-30");
    expect(st.income.map((x) => x.categoryName)).toEqual(["Donations"]);
    expect(st.net).toBe(119.5);
    const ppcL = await repo.ledgerForRange(user("ppc_secretary"), "2026-11-01", "2026-11-30");
    expect(ppcL.rows).toHaveLength(0);
    expect(ppcL.opening).toBe(10 + 30 + 45 + 100);
  });

  it("saves budgets as upserts and compares them to actuals", async () => {
    const pri = user("priest");
    await repo.saveBudget(pri, 2026, new Map([[id.donation!, 1000], [id.fuel!, 500]]));
    await repo.saveBudget(pri, 2026, new Map([[id.donation!, 1200]]));   // same (year, category) -> update, not duplicate
    const lines = await repo.budgetForYear(pri, 2026);
    expect(lines.find((x) => x.categoryId === id.donation)!.amount).toBe(1200);
    expect(lines).toHaveLength(2);
    const c = await repo.budgetComparison(pri, 2026, "2026-12-31");
    expect(c.expense[0]).toMatchObject({ categoryName: "Fuel", budgeted: 500, actual: 80.5, variance: -419.5 });
  });

  it("version-guards edits (optimistic concurrency)", async () => {
    const pri = user("priest");
    const base = { costCenterAccount: null, transactionDate: "2026-11-03", pvNo: "PV-2026-0001", paymentMethod: "cash" as const, invoiceDate: null, amountInWords: null, description: "v", approvedBy: null, preparedBy: null, receivedBy: null, receivedDate: null };
    const { id: tid } = (await repo.saveTransaction(pri, null, { ...base, categoryId: id.fuel!, amount: 5 })) as { id: number };
    const stale = "2000-01-01 00:00:00+00";
    expect(await repo.saveTransaction(pri, tid, { ...base, categoryId: id.fuel!, amount: 6 }, stale)).toBe("conflict");
    expect(await repo.suggestNextPvNo("2026")).toBe("PV-2026-0002");
  });
});
