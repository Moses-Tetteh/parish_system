import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { listCategories } from "@/lib/financials/repository";
import { fmtMoney } from "@/lib/financials/money";
import type { SP } from "@/lib/forms";
import { addCategoryAction, duesConfigAction, offeringAction, tierConfigAction, toggleCategoryAction } from "../actions";

export const metadata = { title: "Financial Categories" };
export const dynamic = "force-dynamic";

export default async function Categories({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("financials.core");
  const sp = await searchParams;
  const cats = await listCategories();

  return (
    <>
      <h1>General Ledger Accounts</h1>
      <Notice sp={sp} />
      <p className="hint">Offering and dues categories are the slice the PPC Secretary works with; the main Secretary sees every other account.</p>

      <div className="card">
        <h2>Add an account</h2>
        <form action={addCategoryAction} className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="name">Name</label><input id="name" name="name" required maxLength={150} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="type">Type</label><select id="type" name="type"><option value="income">Income</option><option value="expense">Expense</option></select></div>
          <button className="btn" type="submit">➕ Add</button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Offering</th><th scope="col">Dues</th><th scope="col">Age-tiered dues</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.type === "income" ? "Income" : "Expense"}</td>
                <td>
                  <ConfirmForm action={toggleCategoryAction.bind(null, c.id, c.isActive !== 1)} message={`${c.isActive === 1 ? "Deactivate" : "Activate"} “${c.name}”?`}>
                    <button className={`btn btn-small ${c.isActive === 1 ? "btn-secondary" : ""}`} type="submit">{c.isActive === 1 ? "Active — deactivate" : "Inactive — activate"}</button>
                  </ConfirmForm>
                </td>
                <td>
                  {c.type === "income" ? (
                    <form action={offeringAction.bind(null, c.id)} className="inline-form">
                      <label className="check-inline"><input type="checkbox" name="is_offering_category" value="1" defaultChecked={c.isOfferingCategory === 1} /> Offering</label>
                      <button className="btn btn-small btn-secondary" type="submit">Save</button>
                    </form>
                  ) : "—"}
                </td>
                <td>
                  {c.type === "income" ? (
                    <form action={duesConfigAction.bind(null, c.id)} className="inline-form">
                      <label className="check-inline"><input type="checkbox" name="is_dues_category" value="1" defaultChecked={c.isDuesCategory === 1} /> Dues</label>
                      <input name="annual_dues_amount" inputMode="decimal" placeholder="Annual amount" defaultValue={c.annualDuesAmount ? Number(c.annualDuesAmount).toFixed(2) : ""} style={{ width: 110 }} aria-label={`Annual dues amount for ${c.name}`} />
                      <button className="btn btn-small btn-secondary" type="submit">Save</button>
                    </form>
                  ) : "—"}
                </td>
                <td>
                  {c.type === "income" && c.isDuesCategory === 1 ? (
                    <form action={tierConfigAction.bind(null, c.id)} className="inline-form">
                      <label className="check-inline"><input type="checkbox" name="is_tiered" value="1" defaultChecked={c.isTiered === 1} /> Tiered</label>
                      {([["tier_child_amount", "Child", c.tierChildAmount], ["tier_youth_amount", "Youth", c.tierYouthAmount], ["tier_adult_amount", "Adult", c.tierAdultAmount]] as const).map(([n, l, val]) => (
                        <input key={n} name={n} inputMode="decimal" placeholder={l} aria-label={`${l} amount for ${c.name}`} defaultValue={val ? Number(val).toFixed(2) : ""} style={{ width: 80 }} />
                      ))}
                      <button className="btn btn-small btn-secondary" type="submit">Save</button>
                    </form>
                  ) : <span className="muted">{c.isDuesCategory === 1 ? "" : "Turn on Dues first"}{c.isTiered === 1 ? ` (${fmtMoney(c.tierAdultAmount)} adult)` : ""}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
