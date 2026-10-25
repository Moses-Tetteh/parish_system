import Link from "next/link";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { listHouseholds } from "@/lib/households/repository";
import { one, type SP } from "@/lib/forms";
import { archiveHouseholdAction } from "./actions";

export const metadata = { title: "Households" };
export const dynamic = "force-dynamic";

export default async function Households({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100), archived = one(sp.archived) === "1";
  const rows = await listHouseholds(user, q, archived);
  return (
    <>
      <h1>Households</h1>
      <Notice sp={sp} />
      <p className="hint">Groups parishioners into families so the office can see who belongs together at a glance. This is a household directory, not a sacrament register — to see what sacraments a family member has received, open the household and follow their “Sacramental Record” link.</p>
      <div className="toolbar">
        <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="text" name="q" placeholder="Search by household name…" defaultValue={q} maxLength={100} aria-label="Search households" style={{ width: 240 }} />
          {archived && <input type="hidden" name="archived" value="1" />}
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <Link href="/households/new" className="btn">➕ Add Household</Link>
        <Link href={archived ? "/households" : "/households?archived=1"} className="btn btn-secondary">{archived ? "Show Active" : "Show Archived"}</Link>
      </div>
      <p className="result-count" aria-live="polite">{rows.length.toLocaleString()} household{rows.length === 1 ? "" : "s"}</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Household</th><th scope="col">Head of Household</th><th scope="col">Phone</th><th scope="col">Members</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5}>No households found.</td></tr>}
          {rows.map((h) => (
            <tr key={h.id}>
              <td>{h.householdName}</td><td>{h.headOfHousehold}</td><td>{h.phone}</td><td>{h.members}</td>
              <td className="row-actions">
                <Link className="btn btn-small" href={`/households/${h.id}`}>View</Link>
                <Link className="btn btn-small btn-secondary" href={`/households/${h.id}/edit`}>Edit</Link>
                <ConfirmForm action={archiveHouseholdAction.bind(null, h.id, !archived)} message={`${archived ? "Restore" : "Archive"} this household?`}><button className="btn btn-small btn-danger" type="submit">{archived ? "Restore" : "Archive"}</button></ConfirmForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
