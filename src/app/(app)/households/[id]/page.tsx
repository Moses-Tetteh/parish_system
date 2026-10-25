import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { RELATIONSHIPS, getHousehold } from "@/lib/households/repository";
import { listMembers } from "@/lib/financials/repository";
import type { SP } from "@/lib/forms";
import { addMemberAction, removeMemberAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Household" };

export default async function HouseholdView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const { id: raw } = await params;
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const data = await getHousehold(user, Number(raw));
  if (!data) notFound();
  const { household: h, members } = data;
  const canDues = roleCan(user.role, "financials.members");
  const duesMembers = canDues ? await listMembers(user, false) : [];

  return (
    <>
      <h1>{h.householdName}</h1>
      <Notice sp={await searchParams} />
      <p className="hint">{[h.headOfHousehold && `Head of household: ${h.headOfHousehold}`, h.phone, h.address].filter(Boolean).join(" · ")}</p>
      {h.notes && <p className="hint" style={{ whiteSpace: "pre-wrap" }}>{h.notes}</p>}
      <div className="toolbar"><Link href={`/households/${h.id}/edit`} className="btn btn-secondary">Edit Household Details</Link><Link href="/households" className="btn btn-secondary">← Back to Households</Link></div>

      <div className="card">
        <h2>Members ({members.length})</h2>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Name</th><th scope="col">Relationship</th>{canDues && <th scope="col">Dues Member?</th>}<th scope="col">Actions</th></tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={canDues ? 4 : 3}>No members added yet.</td></tr>}
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.fullName}</td><td>{m.relationship}</td>
                {canDues && <td>{m.linkedMemberId ? <Link className="btn btn-small btn-secondary" href={`/financials/dues?member=${m.linkedMemberId}`}>Dues History</Link> : "—"}</td>}
                <td className="row-actions">
                  <Link className="btn btn-small btn-secondary" href={`/search?q=${encodeURIComponent(m.fullName)}`} target="_blank" rel="noopener">Sacramental Record</Link>
                  <ConfirmForm action={removeMemberAction.bind(null, h.id, m.id)} message="Remove this person from the household?"><button type="submit" className="btn btn-small btn-danger">Remove</button></ConfirmForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Add a Member</h2>
        <form action={addMemberAction.bind(null, h.id)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}><label htmlFor="full_name">Full Name<span className="req"> *</span></label><input id="full_name" name="full_name" required maxLength={200} /></div>
          <div className="field" style={{ marginBottom: 0, minWidth: 140 }}><label htmlFor="relationship">Relationship</label>
            <select id="relationship" name="relationship" defaultValue=""><option value="">— Select —</option>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
          {canDues && (
            <div className="field" style={{ marginBottom: 0, minWidth: 200 }}><label htmlFor="linked_member_id">Also a Dues Member?</label>
              <select id="linked_member_id" name="linked_member_id" defaultValue=""><option value="">— Not tracked for dues —</option>{duesMembers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</select></div>
          )}
          <button className="btn" type="submit">➕ Add</button>
        </form>
      </div>
    </>
  );
}
