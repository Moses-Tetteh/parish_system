import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { listMembers } from "@/lib/financials/repository";
import { one, type SP } from "@/lib/forms";
import { archiveMemberAction, saveMemberAction } from "../actions";

export const metadata = { title: "Members" };
export const dynamic = "force-dynamic";
const TIERS = { child: "Child", youth: "Youth", adult: "Adult" } as const;

export default async function Members({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("financials.members");
  const sp = await searchParams;
  const archived = one(sp.archived) === "1", q = one(sp.q).slice(0, 100), editId = Number(one(sp.edit)) || null;
  const rows = await listMembers(user, archived, q);
  const editing = editId ? rows.find((m) => m.id === editId) ?? null : null;
  const f = editing;

  return (
    <>
      <h1>Members</h1>
      <Notice sp={sp} />
      <p className="hint">People who pay church dues. The age tier decides which dues amount applies when a category uses tiered pricing.</p>

      <div className="card" id="member-form">
        <h2>{f ? `Edit ${f.fullName}` : "Add a member"}</h2>
        <form action={saveMemberAction.bind(null, f?.id ?? null)} key={f?.id ?? "new"}>
          <div className="form-grid">
            <div className="field"><label htmlFor="full_name">Full name<span className="req"> *</span></label><input id="full_name" name="full_name" required maxLength={200} defaultValue={f?.fullName ?? ""} /></div>
            <div className="field"><label htmlFor="household">Household</label><input id="household" name="household" maxLength={200} defaultValue={f?.household ?? ""} /></div>
            <div className="field"><label htmlFor="member_tier">Age tier</label>
              <select id="member_tier" name="member_tier" defaultValue={f?.memberTier ?? "adult"}>{Object.entries(TIERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="contact">Contact</label><input id="contact" name="contact" maxLength={150} defaultValue={f?.contact ?? ""} /></div>
            <div className="field"><label htmlFor="member_since">Member since (year)</label><input id="member_since" name="member_since" inputMode="numeric" maxLength={4} defaultValue={f?.memberSince ?? ""} /></div>
            <div className="field full"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={2} defaultValue={f?.notes ?? ""} /></div>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">💾 Save</button>
            {f && <a className="btn btn-secondary" href="/financials/members">Cancel</a>}
          </div>
        </form>
      </div>

      <form method="get" className="toolbar">
        {archived && <input type="hidden" name="archived" value="1" />}
        <input type="text" name="q" placeholder="Search name…" defaultValue={q} maxLength={100} aria-label="Search members" style={{ width: 240 }} />
        <button className="btn btn-secondary" type="submit">Search</button>
        <a className="btn btn-secondary" href={archived ? "/financials/members" : "/financials/members?archived=1"}>{archived ? "Show Active" : "Show Archived"}</a>
      </form>
      <p className="result-count">{rows.length.toLocaleString()} member{rows.length === 1 ? "" : "s"}{archived ? " (archived)" : ""}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Name</th><th scope="col">Household</th><th scope="col">Tier</th><th scope="col">Contact</th><th scope="col">Since</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>No members found.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.fullName}</td><td>{m.household}</td><td>{TIERS[m.memberTier as keyof typeof TIERS] ?? m.memberTier}</td><td>{m.contact}</td><td>{m.memberSince}</td>
                <td className="row-actions">
                  <a className="btn btn-small" href={`/financials/members?edit=${m.id}${archived ? "&archived=1" : ""}#member-form`}>Edit</a>
                  <a className="btn btn-small btn-secondary" href={`/financials/dues?member=${m.id}`}>Dues</a>
                  <ConfirmForm action={archiveMemberAction.bind(null, m.id, !archived)} message={`${archived ? "Restore" : "Archive"} ${m.fullName}?`}>
                    <button type="submit" className="btn btn-small btn-danger">{archived ? "Restore" : "Archive"}</button>
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
