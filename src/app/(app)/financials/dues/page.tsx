import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { activeDuesCategories, duesStatusReport, listMembers } from "@/lib/financials/repository";
import { fmtMoney } from "@/lib/financials/money";
import { todayIso } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";
import { recordDuesAction } from "../actions";

export const metadata = { title: "Dues" };
export const dynamic = "force-dynamic";
const BADGE: Record<string, { bg: string; fg: string }> = {
  Paid: { bg: "#eaf4ee", fg: "var(--success)" }, Partial: { bg: "#fdf3dd", fg: "#8a6100" }, Unpaid: { bg: "#faeced", fg: "var(--danger)" }, Overpaid: { bg: "#e8eefb", fg: "#27478f" },
};

export default async function Dues({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("financials.members");
  const sp = await searchParams;
  const today = todayIso(), thisYear = Number(today.slice(0, 4));
  const cats = await activeDuesCategories();
  const categoryId = Number(one(sp.category_id)) || cats[0]?.id || 0;
  const rawYear = Number(one(sp.fiscal_year));
  const year = Number.isInteger(rawYear) && rawYear >= 1990 && rawYear <= 2200 ? rawYear : thisYear;
  const [rows, members] = await Promise.all([categoryId ? duesStatusReport(user, categoryId, year) : [], listMembers(user, false)]);
  const preselect = Number(one(sp.member)) || 0;
  const cat = cats.find((c) => c.id === categoryId);
  const owing = rows.filter((r) => r.totalArrears > 0).length;

  return (
    <>
      <h1>Dues</h1>
      <Notice sp={sp} />
      {cats.length === 0 ? (
        <div className="callout callout-info">No category is marked as a dues category yet. {user.role === "ppc_secretary" ? "Ask the Secretary or Priest to mark one" : "Mark one on the Categories tab"} (an income account with an annual amount).</div>
      ) : (
        <>
          <p className="hint">Payments are applied to the oldest unpaid year first, whatever year they were logged under. Anything beyond every year to date becomes an advance balance.</p>
          <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}><label htmlFor="category_id">Dues category</label>
              <select id="category_id" name="category_id" defaultValue={categoryId}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field" style={{ marginBottom: 0 }}><label htmlFor="fiscal_year">Fiscal year</label>
              <input id="fiscal_year" name="fiscal_year" type="number" min={1990} max={2200} defaultValue={year} style={{ width: 110 }} /></div>
            <button className="btn btn-secondary" type="submit">Show</button>
          </form>

          <div className="card">
            <h2>Record a payment</h2>
            <form action={recordDuesAction}>
              <input type="hidden" name="category_id" value={categoryId} />
              <input type="hidden" name="fiscal_year" value={year} />
              <div className="form-grid">
                <div className="field"><label htmlFor="member_id">Member<span className="req"> *</span></label>
                  <select id="member_id" name="member_id" required defaultValue={preselect || ""}>
                    <option value="">— Select —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.fullName}{m.household ? ` (${m.household})` : ""}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="amount">Amount<span className="req"> *</span></label><input id="amount" name="amount" inputMode="decimal" required /></div>
                <div className="field"><label htmlFor="payment_date">Date<span className="req"> *</span></label><input id="payment_date" type="date" name="payment_date" defaultValue={today} required /></div>
                <div className="field"><label htmlFor="notes">Notes</label><input id="notes" name="notes" maxLength={500} /></div>
              </div>
              <div className="form-actions"><button className="btn" type="submit">💾 Record payment</button></div>
              <p className="field-hint">The payment is also written to the ledger as income under “{cat?.name}”.</p>
            </form>
          </div>

          <p className="result-count">{rows.length} member{rows.length === 1 ? "" : "s"} · {owing} with arrears</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Member</th><th scope="col">Household</th><th scope="col">Expected ({year})</th><th scope="col">Paid ({year})</th><th scope="col">Balance ({year})</th><th scope="col">Status</th><th scope="col">Total arrears</th><th scope="col">Advance</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8}>No members yet. Add them on the Members tab.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.memberId}>
                    <td>{r.fullName}</td><td>{r.household}</td><td className="nowrap">{fmtMoney(r.expected)}</td><td className="nowrap">{fmtMoney(r.paid)}</td><td className="nowrap">{fmtMoney(r.balanceThisYear)}</td>
                    <td><span className="badge" style={{ background: BADGE[r.status]!.bg, color: BADGE[r.status]!.fg }}>{r.status}</span></td>
                    <td className="nowrap">{fmtMoney(r.totalArrears)}</td><td className="nowrap">{fmtMoney(r.totalAdvance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
