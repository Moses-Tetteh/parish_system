import { Notice } from "@/components/Notice";
import { PrintButton } from "@/components/PrintButton";
import { requirePermission } from "@/lib/auth/session";
import { buildStatement } from "@/lib/financials/repository";
import { resolvePeriod } from "@/lib/financials/period";
import { fmtMoney } from "@/lib/financials/money";
import { formatDate, monthName, todayIso } from "@/lib/dates";
import { getSetting } from "@/lib/app-settings";
import type { SP } from "@/lib/forms";

export const metadata = { title: "Financial Statement" };
export const dynamic = "force-dynamic";

export default async function Statement({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("financials.transactions");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const s = await buildStatement(user, period.start, period.end);
  const parish = await getSetting("parish_name", "Blessed Clementina Parish");
  const thisYear = Number(todayIso().slice(0, 4));
  const picked = period.label ? { m: Number(period.start.slice(5, 7)), y: Number(period.start.slice(0, 4)) } : { m: Number(todayIso().slice(5, 7)), y: thisYear };
  const qs = new URLSearchParams(period.label ? { month: String(picked.m), year: String(picked.y) } : { start: period.start, end: period.end }).toString();

  const Section = ({ title, rows, total }: { title: string; rows: typeof s.income; total: number }) => (
    <>
      <tr><th colSpan={2} style={{ background: "var(--gold-pale)" }}>{title}</th></tr>
      {rows.length === 0 && <tr><td colSpan={2}>No categories.</td></tr>}
      {rows.map((r) => <tr key={r.categoryId}><td>{r.categoryName}</td><td className="nowrap" style={{ textAlign: "right" }}>{fmtMoney(r.total)}</td></tr>)}
      <tr><td><strong>Total {title}</strong></td><td className="nowrap" style={{ textAlign: "right" }}><strong>{fmtMoney(total)}</strong></td></tr>
    </>
  );

  return (
    <>
      <h1>Financial Statement</h1>
      <Notice sp={sp} />
      <div className="card no-print">
        <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="month">Monthly report</label>
            <select id="month" name="month" defaultValue={period.label ? String(picked.m) : ""}>
              <option value="">— Month —</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="year">Year</label>
            <select id="year" name="year" defaultValue={period.label ? String(picked.y) : ""}>
              <option value="">— Year —</option>
              {Array.from({ length: 8 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="muted" style={{ alignSelf: "center" }}>or custom range</span>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={period.start} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={period.end} /></div>
          <button type="submit" className="btn btn-secondary">Show</button>
          <PrintButton />
          <a className="btn" href={`/financials/download/statement-pdf?${qs}`} target="_blank" rel="noreferrer">📄 PDF</a>
          <a className="btn" href={`/financials/download/statement-csv?${qs}`}>⬇️ CSV (every transaction)</a>
        </form>
      </div>
      <p className="hint no-print">Picking a month and year overrides the custom range.</p>

      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <strong style={{ fontSize: "1.1rem" }}>{parish}</strong><br /><strong>Income &amp; Expenditure Statement</strong><br />
          <span className="muted">{period.label ?? `${formatDate(period.start)} to ${formatDate(period.end)}`}</span>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              <Section title="Income" rows={s.income} total={s.totalIncome} />
              <Section title="Expense" rows={s.expense} total={s.totalExpense} />
              <tr><td><strong>{s.net >= 0 ? "Net Surplus" : "Net Deficit"}</strong></td><td className="nowrap" style={{ textAlign: "right", color: s.net >= 0 ? "var(--success)" : "var(--danger)" }}><strong>{fmtMoney(s.net)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
