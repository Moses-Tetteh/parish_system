import Link from "next/link";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { categoryScope, listCategories, searchTransactions } from "@/lib/financials/repository";
import { resolveTxFilters } from "@/lib/financials/period";
import { fmtMoney, fromPesewas, toPesewas } from "@/lib/financials/money";
import { formatDate } from "@/lib/dates";
import type { SP } from "@/lib/forms";
import { archiveTransactionAction } from "./actions";

export const metadata = { title: "Financials" };
export const dynamic = "force-dynamic";

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("financials.transactions");
  const sp = await searchParams;
  const f = resolveTxFilters(sp);
  const [rows, scope] = await Promise.all([searchTransactions(user, f), categoryScope(user)]);
  const cats = await listCategories(scope);
  let inc = 0, exp = 0;
  for (const t of rows) (t.categoryType === "income" ? (inc += toPesewas(t.amount)) : (exp += toPesewas(t.amount)));
  const toggle = new URLSearchParams({ start: f.start, end: f.end, ...(f.type && { type: f.type }), ...(f.category && { category: String(f.category) }), ...(!f.archived && { archived: "1" }) });

  return (
    <>
      <h1>Financials</h1>
      <Notice sp={sp} />
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-count" style={{ color: "var(--success)" }}>{fmtMoney(fromPesewas(inc))}</div><div className="stat-label">Total Income (filtered)</div></div>
        <div className="stat-card"><div className="stat-count" style={{ color: "var(--danger)" }}>{fmtMoney(fromPesewas(exp))}</div><div className="stat-label">Total Expense (filtered)</div></div>
        <div className="stat-card"><div className="stat-count">{fmtMoney(fromPesewas(inc - exp))}</div><div className="stat-label">Net</div></div>
      </div>

      <div className="card">
        <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
          {f.archived && <input type="hidden" name="archived" value="1" />}
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={f.start} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={f.end} /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={f.type}><option value="">All</option><option value="income">Income</option><option value="expense">Expense</option></select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="category">General Ledger Account</label>
            <select id="category" name="category" defaultValue={f.category ?? ""}>
              <option value="">All</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type === "income" ? "Income" : "Expense"})</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">Filter</button>
          <button type="submit" formAction="/financials/download/transactions-pdf" formTarget="_blank" className="btn">📄 Download PDF</button>
          <button type="submit" formAction="/financials/download/transactions-csv" className="btn">⬇️ Download CSV</button>
          <Link href="/financials/new" className="btn">➕ Add Transaction</Link>
          <Link href={`/financials?${toggle}`} className="btn btn-secondary">{f.archived ? "Show Active" : "Show Archived"}</Link>
        </form>
      </div>

      <p className="result-count" aria-live="polite">{rows.length.toLocaleString()} transaction{rows.length === 1 ? "" : "s"}{f.archived ? " (archived)" : ""}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Date</th><th scope="col">P.V. No.</th><th scope="col">Type</th><th scope="col">GL Account</th><th scope="col">Description</th><th scope="col">Amount</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}>No transactions found for this filter.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{formatDate(t.transactionDate)}</td>
                <td>{t.pvNo}</td>
                <td><span className="badge" style={t.categoryType === "income" ? { background: "#eaf4ee", color: "var(--success)" } : { background: "#faeced", color: "var(--danger)" }}>{t.categoryType === "income" ? "Income" : "Expense"}</span></td>
                <td>{t.categoryName}</td>
                <td>{t.description}</td>
                <td className="nowrap">{fmtMoney(t.amount)}</td>
                <td className="row-actions">
                  <Link href={`/financials/${t.id}`} className="btn btn-small">Edit</Link>
                  <Link href={`/financials/voucher/${t.id}`} className="btn btn-small btn-secondary">Voucher</Link>
                  <ConfirmForm action={archiveTransactionAction.bind(null, t.id, !f.archived)} message={`${f.archived ? "Restore" : "Archive"} this transaction?`}>
                    <button type="submit" className="btn btn-small btn-danger">{f.archived ? "Restore" : "Archive"}</button>
                  </ConfirmForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
