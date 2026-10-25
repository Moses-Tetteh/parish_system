import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ParishionerPicker } from "@/components/ParishionerPicker";
import { requirePermission } from "@/lib/auth/session";
import { EVENT_TYPES, incomingHistory, keyOf, pendingByParish, sentHistory } from "@/lib/notifications/service";
import { formatDate, todayIso } from "@/lib/dates";
import type { SP } from "@/lib/forms";
import { incomingAction, markSentAction } from "./actions";

export const metadata = { title: "Baptism Notifications" };
export const dynamic = "force-dynamic";

export default async function Notifications({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("notifications");
  const sp = await searchParams;
  const [grouped, sent, incoming] = await Promise.all([pendingByParish(user), sentHistory(user), incomingHistory(user)]);
  const total = [...grouped.values()].reduce((a, r) => a + r.length, 0);
  return (
    <>
      <h1>Baptism Notifications</h1>
      <Notice sp={sp} />
      <p className="hint">Canon 535 §2 — a confirmation, marriage, ordination or religious profession must be noted on the person’s baptismal entry. Events here for people baptised elsewhere are listed below; notices received from other parishes are recorded at the bottom.</p>
      <h2>To send — people baptised in another parish <span className="badge">{total}</span></h2>
      {grouped.size === 0 && <p className="empty-state">✅ Nothing waiting — every event for people baptised elsewhere has been notified.</p>}
      {[...grouped.entries()].map(([place, rows]) => (
        <div className="card" key={place}>
          <div className="card-head"><h3>{place} <small>({rows.length} event{rows.length === 1 ? "" : "s"})</small></h3><Link className="btn btn-small" href={`/notifications/letter?place=${encodeURIComponent(place)}`} target="_blank">📄 Prepare letter</Link></div>
          <form action={markSentAction}>
            <input type="hidden" name="place" value={place} />
            <div className="table-wrap"><table>
              <thead><tr><th scope="col">Sent?</th><th scope="col">Person</th><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Place</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={keyOf(r)}><td><input type="checkbox" name="keys" value={keyOf(r)} aria-label={`Mark ${r.person} as notified`} /></td><td>{r.person}</td><td>{r.event}{r.partner ? ` to ${r.partner}` : ""}</td><td>{r.event_date ? formatDate(r.event_date) : "—"}</td><td>{r.event_place ?? "—"}</td></tr>
              ))}</tbody>
            </table></div>
            <div className="toolbar" style={{ alignItems: "flex-end" }}>
              <label className="inline-label">Sent on <input type="date" name="sent_on" defaultValue={todayIso()} required /></label>
              <label className="inline-label">Method <select name="method" defaultValue="post"><option value="post">Post</option><option value="email">Email</option><option value="hand">By hand</option></select></label>
              <label className="inline-label">Reference <input name="reference_no" maxLength={100} /></label>
              <button className="btn btn-small" type="submit">Mark selected as sent</button>
            </div>
          </form>
        </div>
      ))}

      {sent.length > 0 && (<><h2>Sent</h2><div className="table-wrap"><table>
        <thead><tr><th scope="col">Sent on</th><th scope="col">Details</th><th scope="col">Method</th><th scope="col">Reference</th><th scope="col">By</th></tr></thead>
        <tbody>{sent.map((s) => <tr key={s.id}><td>{formatDate(s.sentOn)}</td><td>{s.notes}</td><td>{s.method ?? "—"}</td><td>{s.referenceNo ?? "—"}</td><td>{s.sentBy}</td></tr>)}</tbody>
      </table></div></>)}

      <h2>Notice received from another parish</h2>
      <div className="card" style={{ maxWidth: 760 }}>
        <form action={incomingAction}>
          <div className="form-grid">
            <ParishionerPicker name="baptism_id" label="Person (baptised here) *" api="/api/lookup/baptism" placeholder="Type 2+ letters of the name, or the register no…" />
            <div className="field"><label htmlFor="event_type">Event *</label><select id="event_type" name="event_type" required defaultValue=""><option value="">— Select —</option>{Object.entries(EVENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="event_date">Date of event</label><input id="event_date" type="date" name="event_date" /></div>
            <div className="field"><label htmlFor="event_place">Place of event</label><input id="event_place" name="event_place" maxLength={250} /></div>
            <div className="field"><label htmlFor="notifying_parish">Notifying parish / institute</label><input id="notifying_parish" name="notifying_parish" maxLength={250} /></div>
            <div className="field"><label htmlFor="letter_ref">Their letter reference</label><input id="letter_ref" name="letter_ref" maxLength={100} /></div>
            <div className="field"><label htmlFor="received_on">Received on</label><input id="received_on" type="date" name="received_on" defaultValue={todayIso()} /></div>
            <div className="field full"><label htmlFor="notes">Notes</label><input id="notes" name="notes" maxLength={300} /></div>
          </div>
          <div className="form-actions"><button className="btn" type="submit">Record notice</button></div>
        </form>
      </div>
      {incoming.length > 0 && (<><h2>Received</h2><div className="table-wrap"><table>
        <thead><tr><th scope="col">Received</th><th scope="col">Person</th><th scope="col">Event</th><th scope="col">From</th><th scope="col">Ref.</th></tr></thead>
        <tbody>{incoming.map(({ e, given, surname }) => <tr key={e.id}><td>{formatDate(e.receivedOn)}</td><td>{`${given ?? ""} ${surname ?? ""}`.trim()}</td><td>{EVENT_TYPES[e.eventType] ?? e.eventType}{e.eventDate ? ` — ${formatDate(e.eventDate)}` : ""}</td><td>{e.notifyingParish ?? "—"}</td><td>{e.letterRef ?? "—"}</td></tr>)}</tbody>
      </table></div></>)}
    </>
  );
}
