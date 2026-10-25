import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { ParishionerPicker } from "@/components/ParishionerPicker";
import { requirePermission } from "@/lib/auth/session";
import { formatDate, todayIso } from "@/lib/dates";
import { getRegister } from "@/lib/registers/registry";
import { OFFICES, defaultPeriod, isValidPeriod, outstanding, paidInFull } from "@/lib/societies/rules";
import { getSociety, societyOverview } from "@/lib/societies/service";
import { fmtMoney } from "@/lib/financials/money";
import { one, type SP } from "@/lib/forms";
import { societyAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Group" };

export default async function SocietyView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const { id: raw } = await params;
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const sp = await searchParams;
  const found = await getSociety(user, Number(raw));
  if (!found) notFound();
  const { s: soc, outstation } = found;
  const today = todayIso();
  const def = defaultPeriod(soc.duesPeriod, today);
  const period = isValidPeriod(one(sp.period)) ? one(sp.period) : def;
  const { members, paidBy, meetings } = await societyOverview(user, soc.id, period);
  const due = Number(soc.duesAmount ?? 0);
  const collected = [...paidBy.values()].reduce((a, b) => a + b, 0);
  const paidCount = [...paidBy.values()].filter((v) => paidInFull(v, due)).length;
  const typeLabel = getRegister("societies")?.fields.find((f) => f.key === "group_type")?.options?.[soc.groupType] ?? soc.groupType;
  const Hid = ({ act, extra }: { act: string; extra?: Record<string, string | number> }) => (<><input type="hidden" name="society_id" value={soc.id} /><input type="hidden" name="do" value={act} /><input type="hidden" name="period" value={period} />{Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>);

  return (
    <>
      <h1>{soc.name}</h1>
      <Notice sp={sp} />
      <p className="hint">{[typeLabel, outstation, soc.leaderName && `Leader: ${soc.leaderName}`, soc.meetingDay && `Meets ${soc.meetingDay}${soc.meetingTime ? ` ${soc.meetingTime.slice(0, 5)}` : ""}${soc.meetingVenue ? ` at ${soc.meetingVenue}` : ""}`].filter(Boolean).join(" · ")}</p>
      <p><Link className="btn btn-secondary" href={`/registers/societies/${soc.id}`}>Edit group</Link> <Link className="btn btn-secondary" href="/registers/societies">← All groups</Link></p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        <div className="card">
          <h2>Members ({members.length})</h2>
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">Name</th><th scope="col">Office</th><th scope="col">Phone</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={4}>No members yet.</td></tr>}
              {members.map((m) => (
                <tr key={m.id}><td>{m.fullName}</td><td>{m.office}</td><td>{m.phone ?? "—"}</td>
                  <td><ConfirmForm action={societyAction} message={`Remove ${m.fullName} from this group?`}><Hid act="remove_member" extra={{ member_id: m.id }} /><button className="btn btn-small btn-danger" type="submit">Remove</button></ConfirmForm></td></tr>
              ))}
            </tbody>
          </table></div>
          <details><summary>➕ Add a member</summary>
            <form action={societyAction}><Hid act="add_member" />
              <div className="form-grid">
                <ParishionerPicker name="parishioner_id" label="Pick from the parish list" />
                <div className="field"><label htmlFor="full_name">or type the name</label><input id="full_name" name="full_name" maxLength={250} /></div>
                <div className="field"><label htmlFor="office">Office</label><select id="office" name="office">{OFFICES.map((o) => <option key={o}>{o}</option>)}</select></div>
                <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" maxLength={60} /></div>
              </div>
              <button className="btn btn-small" type="submit">Add member</button>
            </form>
          </details>
        </div>

        <div className="card">
          <h2>Dues — {period}</h2>
          <form method="get" className="toolbar"><input type="text" name="period" defaultValue={period} size={8} aria-label="Period" /><button className="btn btn-small btn-secondary" type="submit">Show</button><small className="hint">Use {def} format ({soc.duesPeriod})</small></form>
          {due > 0 ? <p>{paidCount} of {members.length} paid in full · collected <strong>GHS {fmtMoney(collected)}</strong> of GHS {fmtMoney(due * members.length)}</p> : <p className="hint">No dues amount set — edit the group to set one.</p>}
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">Member</th><th scope="col">Paid</th><th scope="col">Record payment</th></tr></thead>
            <tbody>{members.map((m) => {
              const p = paidBy.get(m.id) ?? 0;
              return (
                <tr key={m.id}><td>{m.fullName}</td>
                  <td><span className="badge" style={paidInFull(p, due) ? { background: "#eaf4ee", color: "var(--success)" } : p > 0 ? { background: "#fdf3dd", color: "#8a6100" } : { background: "#faeced", color: "var(--danger)" }}>{p > 0 ? `GHS ${fmtMoney(p)}` : "Unpaid"}</span></td>
                  <td><form action={societyAction} className="inline-form"><Hid act="pay" extra={{ member_id: m.id }} /><input name="amount" inputMode="decimal" required style={{ width: 90 }} aria-label={`Amount for ${m.fullName}`} defaultValue={outstanding(p, due) > 0 ? outstanding(p, due).toFixed(2) : ""} /><button className="btn btn-small" type="submit">Pay</button></form></td></tr>
              );
            })}</tbody>
          </table></div>
        </div>
      </div>

      <div className="card">
        <h2>Meetings</h2>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Venue</th><th scope="col">Attendance</th><th scope="col">Summary</th></tr></thead>
          <tbody>{meetings.length === 0 && <tr><td colSpan={4}>No meetings recorded.</td></tr>}{meetings.map((mt) => <tr key={mt.id}><td>{formatDate(mt.meetingDate)}</td><td>{mt.venue ?? "—"}</td><td>{mt.attendance ?? "—"}</td><td>{mt.summary ?? "—"}</td></tr>)}</tbody>
        </table></div>
        <details><summary>➕ Record a meeting</summary>
          <form action={societyAction}><Hid act="add_meeting" />
            <div className="form-grid">
              <div className="field"><label htmlFor="meeting_date">Date *</label><input id="meeting_date" type="date" name="meeting_date" required defaultValue={today} /></div>
              <div className="field"><label htmlFor="venue">Venue</label><input id="venue" name="venue" defaultValue={soc.meetingVenue ?? ""} maxLength={200} /></div>
              <div className="field"><label htmlFor="attendance">Attendance</label><input id="attendance" type="number" name="attendance" min={0} /></div>
              <div className="field full"><label htmlFor="summary">Summary / resolutions</label><textarea id="summary" name="summary" rows={2} /></div>
            </div>
            <button className="btn btn-small" type="submit">Save meeting</button>
          </form>
        </details>
      </div>
    </>
  );
}
