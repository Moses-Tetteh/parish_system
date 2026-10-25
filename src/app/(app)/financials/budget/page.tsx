import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { budgetComparison, budgetForYear, budgetYears, suggestBudget } from "@/lib/financials/repository";
import { fmtMoney } from "@/lib/financials/money";
import { formatDate, todayIso } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";
import { saveBudgetAction } from "../actions";

export const metadata = { title: "Budgeting" };
export const dynamic = "force-dynamic";

export default async function Budget({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("financials.core");
  const sp = await searchParams;
  const today = todayIso(), thisYear = Number(today.slice(0, 4));
  const yearOf = (v: string) => { const n = Number(v); return Number.isInteger(n) && n >= 2000 && n <= 2200 ? n : null; };
  const targetYear = yearOf(one(sp.target_year)), viewYear = yearOf(one(sp.year));
  const adj = Math.max(-100, Math.min(500, Number(one(sp.adjustment_percent)) || 0));

  const years = await budgetYears();
  const suggestion = targetYear ? await suggestBudget(user, adj, today) : null;
  const existing = !suggestion && viewYear ? await budgetForYear(user, viewYear) : null;
  const comparison = existing && one(sp.compare) === "1" ? await budgetComparison(user, viewYear!, today) : null;

  const EditTable = ({ year, lines }: { year: number; lines: { categoryId: number; categoryName: string; type: string; amount: number; referenceActual?: number }[] }) => (
    <form action={saveBudgetAction}>
      <input type="hidden" name="fiscal_year" value={year} />
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Account</th><th scope="col">Type</th>{lines.some((l) => l.referenceActual !== undefined) && <th scope="col">Last 12 months actual</th>}<th scope="col">Budget {year}</th></tr></thead>
        <tbody>{lines.map((l) => (
          <tr key={l.categoryId}>
            <td>{l.categoryName}<input type="hidden" name="category_id" value={l.categoryId} /></td><td>{l.type === "income" ? "Income" : "Expense"}</td>
            {l.referenceActual !== undefined && <td className="nowrap">{fmtMoney(l.referenceActual)}</td>}
            <td><input name="amount" inputMode="decimal" defaultValue={l.amount.toFixed(2)} aria-label={`Budget for ${l.categoryName}`} style={{ width: 130 }} /></td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="form-actions"><button className="btn" type="submit">💾 Save budget for {year}</button><Link className="btn btn-secondary" href="/financials/budget">Cancel</Link></div>
    </form>
  );

  return (
    <>
      <h1>Budgeting</h1>
      <Notice sp={sp} />

      {!suggestion && !existing && (
        <>
          <div className="card">
            <h2>Generate a Budget Plan</h2>
            <p className="muted">Uses the last 12 months of actual income and expenses, adjusted by a percentage you choose, as a starting point. Nothing is saved until you review and confirm.</p>
            <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0 }}><label htmlFor="target_year">Budget year</label><input id="target_year" name="target_year" type="number" min={2000} max={2200} defaultValue={thisYear + 1} style={{ width: 110 }} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label htmlFor="adjustment_percent">Adjustment %</label><input id="adjustment_percent" name="adjustment_percent" type="number" step="0.1" defaultValue={5} style={{ width: 110 }} /></div>
              <button className="btn" type="submit">Generate</button>
            </form>
          </div>
          <div className="card">
            <h2>Saved budgets</h2>
            {years.length === 0 ? <p className="muted">No budget saved yet.</p> : (
              <ul className="plain-list">{years.map((y) => (
                <li key={y}><strong>{y}</strong> — <Link href={`/financials/budget?year=${y}`}>View / edit</Link> · <Link href={`/financials/budget?year=${y}&compare=1`}>Budget vs Actual</Link></li>
              ))}</ul>
            )}
          </div>
        </>
      )}

      {suggestion && (
        <div className="card">
          <h2>Suggested budget for {targetYear}</h2>
          <p className="muted">Based on actuals from {formatDate(suggestion.referenceStart)} to {formatDate(suggestion.referenceEnd)}, adjusted by {adj}%. Edit any figure before saving.</p>
          <EditTable year={targetYear!} lines={suggestion.lines} />
        </div>
      )}

      {existing && (
        <div className="card">
          <h2>Budget {viewYear}</h2>
          {existing.length === 0 ? <p className="muted">No budget lines saved for {viewYear}.</p> : <EditTable year={viewYear!} lines={existing} />}
          <p><Link href={`/financials/budget?year=${viewYear}&compare=1`}>Show Budget vs Actual</Link> · <a href={`/financials/download/budget-pdf?year=${viewYear}`} target="_blank" rel="noreferrer">📄 PDF</a> · <a href={`/financials/download/comparison-pdf?year=${viewYear}`} target="_blank" rel="noreferrer">📄 Budget vs Actual PDF</a></p>
        </div>
      )}

      {comparison && (
        <div className="card">
          <h2>Budget vs Actual — {viewYear}</h2>
          <p className="muted">Actuals through {formatDate(comparison.actualThrough)}.</p>
          {(["income", "expense"] as const).map((t) => (
            <div className="table-wrap" key={t}><table>
              <thead><tr><th scope="col">{t === "income" ? "Income" : "Expense"}</th><th scope="col">Budgeted</th><th scope="col">Actual</th><th scope="col">Variance</th></tr></thead>
              <tbody>{comparison[t].length === 0 && <tr><td colSpan={4}>No lines.</td></tr>}{comparison[t].map((l) => (
                <tr key={l.categoryName}><td>{l.categoryName}</td><td className="nowrap">{fmtMoney(l.budgeted)}</td><td className="nowrap">{fmtMoney(l.actual)}</td>
                  <td className="nowrap" style={{ color: (t === "income" ? l.variance >= 0 : l.variance <= 0) ? "var(--success)" : "var(--danger)" }}>{fmtMoney(l.variance)}</td></tr>
              ))}</tbody>
            </table></div>
          ))}
        </div>
      )}
    </>
  );
}
