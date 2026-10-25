import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { householdImportCandidates } from "@/lib/parishioners/tools";
import type { SP } from "@/lib/forms";
import { importHouseholdsAction } from "../actions";

export const metadata = { title: "Import from Households" };
export const dynamic = "force-dynamic";

export default async function ImportHouseholds({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const rows = await householdImportCandidates(user);
  return (
    <>
      <h1>Import from Households</h1>
      <Notice sp={await searchParams} />
      <p className="hint">Household members not yet on the parishioners list. Tick the ones to add — marital status, practice and sacraments are then completed on each parishioner’s record.</p>
      {rows.length === 0 ? <p className="empty-state">✅ Every household member is already on the list.</p> : (
        <form action={importHouseholdsAction}>
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">Add</th><th scope="col">Name</th><th scope="col">Household</th><th scope="col">Role</th></tr></thead>
            <tbody>{rows.map((c) => <tr key={c.id}><td><input type="checkbox" name="ids" value={c.id} defaultChecked aria-label={`Add ${c.fullName}`} /></td><td>{c.fullName}</td><td>{c.householdName}</td><td>{c.relationship ?? "—"}</td></tr>)}</tbody>
          </table></div>
          <button className="btn" type="submit">Add selected to the list</button>
        </form>
      )}
      <p><Link className="btn btn-secondary" href="/registers/parishioners">← Parishioners</Link></p>
    </>
  );
}
