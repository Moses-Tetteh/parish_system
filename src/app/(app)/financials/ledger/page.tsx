import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { ledgerForRange } from "@/lib/financials/repository";
import { resolveTxFilters } from "@/lib/financials/period";
import { fmtMoney } from "@/lib/financials/money";
import { formatDate } from "@/lib/dates";
import { getSetting } from "@/lib/app-settings";
import { PrintButton } from "@/components/PrintButton";
import type { SP } from "@/lib/forms";

export const metadata = { title: "General Ledger" };
export const dynamic = "force-dynamic";

export default async function Ledger({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("financials.transactions");
  const sp = await searchParams;
  const { start, end } = resolveTxFilters(sp);
  const l = await ledgerForRange(user, start, end);
  const parish = await getSetting("parish_name", "Blessed Clementina Parish");

  return (
    <>
      <h1>General Ledger</h1>
      <Notice sp={sp} />
      <div className="card no-print">
        <form method="get" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={start} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={end} /></div>
          <button type="submit" className="btn btn-secondary">Filter</button>
          <PrintButton />
          <button type="submit" formAction="/financials/download/ledger-pdf" formTarget="_blank" className="btn">📄 Download PDF</button>
        </form>
      </div>

      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <strong style={{ fontSize: "1.1rem" }}>{parish}</strong><br />
          <strong>General Ledger</strong><br />
          <span className="muted">{formatDate(start)} to {formatDate(end)}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Date</th><th scope="col">P.V. No.</th><th scope="col">GL Account</th><th scope="col">Description</th><th scope="col">Debit (Expense)</th><th scope="col">Credit (Income)</th><th scope="col">Balance</th></tr></thead>
            <tbody>
              <tr><td colSpan={6}><strong>Brought forward</strong></td><td className="nowrap"><strong>{fmtMoney(l.opening)}</strong></td></tr>
              {l.rows.length === 0 && <tr><td colSpan={7}>No transactions in this period.</td></tr>}
              {l.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDate(r.transactionDate)}</td><td>{r.pvNo}</td><td>{r.categoryName}</td><td>{r.description}</td>
                  <td className="nowrap">{r.categoryType === "expense" ? fmtMoney(r.amount) : ""}</td>
                  <td className="nowrap">{r.categoryType === "income" ? fmtMoney(r.amount) : ""}</td>
                  <td className="nowrap">{fmtMoney(r.runningBalance)}</td>
                </tr>
              ))}
              <tr><td colSpan={4}><strong>Totals / Closing balance</strong></td><td className="nowrap"><strong>{fmtMoney(l.debit)}</strong></td><td className="nowrap"><strong>{fmtMoney(l.credit)}</strong></td><td className="nowrap"><strong>{fmtMoney(l.closing)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
