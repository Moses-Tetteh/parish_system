import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { levyOverview } from "@/lib/levy/service";
import { fmtMoney } from "@/lib/financials/money";
import { formatDate, todayIso } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";
import { deleteRemittanceAction, levyCategoriesAction, remitAction } from "./actions";

export const metadata = { title: "Diocesan Remittances" };
export const dynamic = "force-dynamic";

export default async function Levy({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("levy.view");
  const sp = await searchParams;
  const y = Number(one(sp.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : Number(todayIso().slice(0, 4));
  const manage = roleCan(user.role, "levy.manage");
  const o = await levyOverview(user, year);
  const toRemit = Math.round((o.totalDue - o.totalPaid) * 100) / 100;
  const pill = (s: string) => s === "owing" ? { background: "#faeced", color: "var(--danger)" } : { background: "#eaf4ee", color: "var(--success)" };

  return (
    <>
      <h1>Diocesan Levy &amp; Special Collections</h1>
      <Notice sp={sp} />
      <p className="hint">Income categories flagged “remit to diocese” are totalled from the Financials ledger — nothing is typed twice. Record each payment to the diocese here to see what is still owed.</p>
      <form method="get" className="toolbar"><label className="inline-label">Year <input type="number" name="year" defaultValue={year} min={2000} max={2100} style={{ width: 90 }} /></label><button className="btn btn-secondary" type="submit">Show</button></form>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-count">GHS {fmtMoney(o.totalDue)}</div><div className="stat-label">Due to the diocese ({year})</div></div>
        <div className="stat-card"><div className="stat-count" style={{ color: "var(--success)" }}>GHS {fmtMoney(o.totalPaid)}</div><div className="stat-label">Remitted</div></div>
        <div className="stat-card"><div className="stat-count" style={{ color: toRemit > 0 ? "var(--danger)" : "var(--success)" }}>GHS {fmtMoney(toRemit)}</div><div className="stat-label">Still to remit</div></div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Category</th><th scope="col">Collected</th><th scope="col">% to diocese</th><th scope="col">Due</th><th scope="col">Remitted</th><th scope="col">Balance</th></tr></thead>
        <tbody>
          {o.lines.length === 0 && <tr><td colSpan={6}>No categories flagged yet.{manage ? " Tick them under “Categories” below." : ""}</td></tr>}
          {o.lines.map((l) => (
            <tr key={l.id}><td>{l.name}</td><td>GHS {fmtMoney(l.collected)}</td><td>{l.percent === null ? "100%" : `${l.percent}%`}</td><td>GHS {fmtMoney(l.due)}</td><td>GHS {fmtMoney(l.remitted)}</td>
              <td><span className="badge" style={pill(l.state)}>{l.state === "owing" ? `Owe GHS ${fmtMoney(l.balance)}` : l.state === "overpaid" ? `Overpaid ${fmtMoney(-l.balance)}` : "Settled"}</span></td></tr>
          ))}
        </tbody>
      </table></div>

      {manage && o.lines.length > 0 && (
        <div className="card" id="remit" style={{ maxWidth: 640 }}>
          <h2>Record a payment to the diocese</h2>
          <form action={remitAction}>
            <input type="hidden" name="year" value={year} />
            <div className="form-grid">
              <div className="field"><label htmlFor="category_id">Category *</label><select id="category_id" name="category_id" required defaultValue=""><option value="">— Select —</option>{o.lines.map((l) => <option key={l.id} value={l.id}>{l.name}{l.balance > 0 ? ` (owe ${fmtMoney(l.balance)})` : ""}</option>)}</select></div>
              <div className="field"><label htmlFor="amount">Amount (GHS) *</label><input id="amount" name="amount" inputMode="decimal" required /></div>
              <div className="field"><label htmlFor="remitted_on">Date paid *</label><input id="remitted_on" type="date" name="remitted_on" defaultValue={todayIso()} required /></div>
              <div className="field"><label htmlFor="reference_no">Receipt / bank slip no.</label><input id="reference_no" name="reference_no" maxLength={150} /></div>
              <div className="field full"><label htmlFor="notes">Notes</label><input id="notes" name="notes" maxLength={300} /></div>
            </div>
            <div className="form-actions"><button className="btn" type="submit">Save payment</button></div>
          </form>
        </div>
      )}

      {o.history.length > 0 && (<>
        <h2>Payments in {year}</h2>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Amount</th><th scope="col">Reference</th><th scope="col">By</th><th scope="col">Notes</th>{manage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{o.history.map(({ r, category }) => (
            <tr key={r.id}><td>{formatDate(r.remittedOn)}</td><td>{category}</td><td>GHS {fmtMoney(r.amountRemitted)}</td><td>{r.referenceNo ?? "—"}</td><td>{r.remittedBy}</td><td>{r.notes}</td>
              {manage && <td><ConfirmForm action={deleteRemittanceAction.bind(null, year, r.id)} message="Delete this payment record? It stays in the audit trail."><button className="btn btn-small btn-danger" type="submit">Delete</button></ConfirmForm></td>}</tr>
          ))}</tbody>
        </table></div>
      </>)}

      {manage && (
        <>
          <h2>Categories</h2>
          <p className="hint">Tick the income categories whose money (all or a percentage) goes to the diocese — e.g. the annual diocesan levy, Peter’s Pence, Mission Sunday. Leave % blank for 100%.</p>
          <form action={levyCategoriesAction}>
            <input type="hidden" name="year" value={year} />
            <div className="table-wrap"><table>
              <thead><tr><th scope="col">Remit</th><th scope="col">Category</th><th scope="col">% to diocese</th></tr></thead>
              <tbody>{o.all.map((c) => (
                <tr key={c.id}><td><input type="checkbox" name="remit" value={c.id} defaultChecked={c.flag === 1} aria-label={`Remit ${c.name}`} /></td><td>{c.name}</td>
                  <td><input name={`percent_${c.id}`} inputMode="decimal" defaultValue={c.percent === null ? "" : String(Number(c.percent))} style={{ width: 80 }} aria-label={`Percent for ${c.name}`} /></td></tr>
              ))}</tbody>
            </table></div>
            <button className="btn" type="submit">Save categories</button>
          </form>
        </>
      )}
    </>
  );
}
