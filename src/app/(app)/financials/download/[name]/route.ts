import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { logAccess } from "@/lib/audit";
import { toCsv, safeFilename } from "@/lib/csv";
import { formatDate, todayIso } from "@/lib/dates";
import { getSetting } from "@/lib/app-settings";
import { buildReportPdf, buildVoucherPdf, type ReportInput } from "@/lib/pdf/report";
import {
  FinanceForbiddenError, budgetComparison, budgetForYear, buildStatement, categoryScope, getTransaction, ledgerForRange, listCategories, searchTransactions,
} from "@/lib/financials/repository";
import { resolvePeriod, resolveTxFilters } from "@/lib/financials/period";
import { fmtMoney, fromPesewas, toPesewas } from "@/lib/financials/money";
import { amountToWords } from "@/lib/financials/words";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Q = Record<string, string>;
const pdfResponse = (bytes: Uint8Array, name: string) => new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safeFilename(name)}"`, "Cache-Control": "no-store, private" } });
const csvResponse = (csv: string, name: string) => new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${safeFilename(name)}"`, "Cache-Control": "no-store, private" } });

/**
 * GET-only, read-only downloads. Every one goes through the same scoped repository functions as the pages,
 * so the PPC Secretary / Secretary category split cannot be bypassed by hitting a download URL directly.
 */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { name } = await params;
  const q: Q = Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    const res = await handle(user, name, q);
    if (!res) return new NextResponse("Not found", { status: 404 });
    await logAccess({ username: user.username, role: user.role, action: "export", resource: "financials", detail: name });
    return res;
  } catch (e) {
    if (e instanceof FinanceForbiddenError) return new NextResponse("Forbidden", { status: 403 });
    console.error("financial download failed", name, e);
    return new NextResponse("Could not build the file.", { status: 500 });
  }
}

async function handle(user: SessionUser, name: string, q: Q): Promise<NextResponse | null> {
  const parish = await getSetting("parish_name", "Blessed Clementina Parish");
  const today = todayIso();
  const money = (n: number) => fmtMoney(n);

  switch (name) {
    case "transactions-pdf":
    case "transactions-csv": {
      const f = resolveTxFilters(q);
      const rows = await searchTransactions(user, f);
      let inc = 0, exp = 0;
      for (const t of rows) (t.categoryType === "income" ? (inc += toPesewas(t.amount)) : (exp += toPesewas(t.amount)));
      if (name === "transactions-csv") {
        if (!roleCan(user.role, "export")) throw new FinanceForbiddenError();
        const csv = toCsv(["Date", "P.V. No.", "Type", "GL Account", "Description", "Amount"], [
          ...rows.map((t) => [t.transactionDate, t.pvNo, t.categoryType, t.categoryName, t.description, t.amount.toFixed(2)]),
          [], ["", "", "", "", "Total income", fromPesewas(inc).toFixed(2)], ["", "", "", "", "Total expense", fromPesewas(exp).toFixed(2)], ["", "", "", "", "Net", fromPesewas(inc - exp).toFixed(2)],
        ]);
        return csvResponse(csv, `transactions_${today}.csv`);
      }
      const cats = await listCategories(await categoryScope(user));
      const filt = [`Period: ${formatDate(f.start)} to ${formatDate(f.end)}`, f.type ? `Type: ${f.type}` : "", f.category ? `Account: ${cats.find((c) => c.id === f.category)?.name ?? ""}` : "", f.archived ? "Archived entries only" : ""].filter(Boolean).join("   ·   ");
      const input: ReportInput = {
        parishName: parish, title: "Transactions", subtitle: [filt], landscape: true,
        columns: [{ header: "Date", weight: 10 }, { header: "P.V. No.", weight: 10 }, { header: "Type", weight: 8 }, { header: "GL Account", weight: 22 }, { header: "Description", weight: 36 }, { header: "Amount", weight: 14, align: "right" }],
        rows: [
          ...rows.map((t) => ({ cells: [formatDate(t.transactionDate), t.pvNo ?? "", t.categoryType === "income" ? "Income" : "Expense", t.categoryName, t.description ?? "", money(t.amount)] })),
          { cells: ["", "", "", "", "Total income", money(fromPesewas(inc))], bold: true, shade: true },
          { cells: ["", "", "", "", "Total expense", money(fromPesewas(exp))], bold: true, shade: true },
          { cells: ["", "", "", "", "Net", money(fromPesewas(inc - exp))], bold: true, shade: true },
        ],
      };
      return pdfResponse(await buildReportPdf(input), `transactions_${today}.pdf`);
    }

    case "ledger-pdf": {
      const { start, end } = resolveTxFilters(q);
      const l = await ledgerForRange(user, start, end);
      return pdfResponse(await buildReportPdf({
        parishName: parish, title: "General Ledger", subtitle: [`${formatDate(start)} to ${formatDate(end)}`], landscape: true,
        columns: [{ header: "Date", weight: 10 }, { header: "P.V. No.", weight: 9 }, { header: "GL Account", weight: 20 }, { header: "Description", weight: 31 }, { header: "Debit", weight: 10, align: "right" }, { header: "Credit", weight: 10, align: "right" }, { header: "Balance", weight: 10, align: "right" }],
        rows: [
          { cells: ["", "", "", "Brought forward", "", "", money(l.opening)], bold: true, shade: true },
          ...l.rows.map((r) => ({ cells: [formatDate(r.transactionDate), r.pvNo ?? "", r.categoryName, r.description ?? "", r.categoryType === "expense" ? money(r.amount) : "", r.categoryType === "income" ? money(r.amount) : "", money(r.runningBalance ?? 0)] })),
          { cells: ["", "", "", "Totals / Closing balance", money(l.debit), money(l.credit), money(l.closing)], bold: true, shade: true },
        ],
      }), `ledger_${today}.pdf`);
    }

    case "statement-pdf": {
      const p = resolvePeriod(q);
      const s = await buildStatement(user, p.start, p.end);
      const block = (title: string, rows: typeof s.income, total: number) => [
        { cells: [title, ""], bold: true, shade: true },
        ...rows.map((r) => ({ cells: [r.categoryName, money(r.total)] })),
        { cells: [`Total ${title}`, money(total)], bold: true },
      ];
      return pdfResponse(await buildReportPdf({
        parishName: parish, title: "Income & Expenditure Statement", subtitle: [p.label ?? `${formatDate(p.start)} to ${formatDate(p.end)}`],
        columns: [{ header: "Account", weight: 70 }, { header: "Amount", weight: 30, align: "right" }],
        rows: [...block("Income", s.income, s.totalIncome), ...block("Expense", s.expense, s.totalExpense), { cells: [s.net >= 0 ? "Net Surplus" : "Net Deficit", money(s.net)], bold: true, shade: true }],
      }), `financial_statement_${p.start}_${p.end}.pdf`);
    }

    case "statement-csv": {
      if (!roleCan(user.role, "export")) throw new FinanceForbiddenError();
      const p = resolvePeriod(q);
      const rows = await searchTransactions(user, { start: p.start, end: p.end, type: "", category: null, archived: false });
      let inc = 0, exp = 0;
      for (const t of rows) (t.categoryType === "income" ? (inc += toPesewas(t.amount)) : (exp += toPesewas(t.amount)));
      const sorted = [...rows].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id - b.id);
      return csvResponse(toCsv(["Date", "Type", "Category", "Description", "Amount"], [
        ...sorted.map((t) => [t.transactionDate, t.categoryType, t.categoryName, t.description, t.amount.toFixed(2)]),
        [], ["", "", "", "Total income", fromPesewas(inc).toFixed(2)], ["", "", "", "Total expense", fromPesewas(exp).toFixed(2)], ["", "", "", "Net", fromPesewas(inc - exp).toFixed(2)],
      ]), `statement_${p.start}_${p.end}.csv`);
    }

    case "budget-pdf":
    case "comparison-pdf": {
      const year = Number(q.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
      if (name === "budget-pdf") {
        const lines = await budgetForYear(user, year);
        return pdfResponse(await buildReportPdf({
          parishName: parish, title: `Budget ${year}`, columns: [{ header: "Account", weight: 60 }, { header: "Type", weight: 15 }, { header: "Budget", weight: 25, align: "right" }],
          rows: lines.map((l) => ({ cells: [l.categoryName, l.type === "income" ? "Income" : "Expense", money(l.amount)] })),
        }), `budget_${year}.pdf`);
      }
      const c = await budgetComparison(user, year, today);
      const section = (title: string, lines: typeof c.income) => [{ cells: [title, "", "", ""], bold: true, shade: true }, ...lines.map((l) => ({ cells: [l.categoryName, money(l.budgeted), money(l.actual), money(l.variance)] }))];
      return pdfResponse(await buildReportPdf({
        parishName: parish, title: `Budget vs Actual ${year}`, subtitle: [`Actuals through ${formatDate(c.actualThrough)}`],
        columns: [{ header: "Account", weight: 40 }, { header: "Budgeted", weight: 20, align: "right" }, { header: "Actual", weight: 20, align: "right" }, { header: "Variance", weight: 20, align: "right" }],
        rows: [...section("Income", c.income), ...section("Expense", c.expense)],
      }), `budget_vs_actual_${year}.pdf`);
    }

    case "voucher-pdf": {
      const id = Number(q.id);
      if (!Number.isInteger(id) || id <= 0) return null;
      const t = await getTransaction(user, id);
      if (!t) return null;
      return pdfResponse(await buildVoucherPdf({
        parishName: parish, isIncome: t.categoryType === "income", costCenter: t.costCenterAccount ?? parish, date: formatDate(t.transactionDate), account: t.categoryName,
        pvNo: t.pvNo ?? "", method: t.paymentMethod ? t.paymentMethod[0]!.toUpperCase() + t.paymentMethod.slice(1) : "", invoiceDate: formatDate(t.invoiceDate),
        description: t.description ?? "", amount: money(t.amount), amountInWords: t.amountInWords ?? amountToWords(t.amount),
        preparedBy: t.preparedBy ?? "", receivedBy: t.receivedBy ?? "", receivedDate: t.receivedDate ? formatDate(t.receivedDate) : "", generatedOn: `${formatDate(today)}`,
      }), `voucher_${t.pvNo ?? t.id}.pdf`);
    }
    default: return null;
  }
}
