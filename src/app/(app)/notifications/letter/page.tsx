import { PrintButton } from "@/components/PrintButton";
import { requirePermission } from "@/lib/auth/session";
import { getSetting } from "@/lib/app-settings";
import { formatDate, todayIso } from "@/lib/dates";
import { pendingByParish } from "@/lib/notifications/service";
import { one, type SP } from "@/lib/forms";

export const metadata = { title: "Baptism Notification Letter" };
export const dynamic = "force-dynamic";

/** A print-ready letter to the parish of baptism listing every pending event for it (print / save as PDF from the browser). */
export default async function Letter({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("notifications");
  const place = one((await searchParams).place).slice(0, 250);
  const rows = (await pendingByParish(user)).get(place.trim()) ?? [];
  const [parish, address] = await Promise.all([getSetting("parish_name", "Blessed Clementina Parish"), getSetting("parish_address", "")]);
  return (
    <>
      <p className="no-print"><PrintButton /></p>
      <div className="card" style={{ maxWidth: 780, margin: "0 auto", lineHeight: 1.6 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}><strong style={{ fontSize: "1.2rem" }}>{parish}</strong><br /><span style={{ whiteSpace: "pre-line" }}>{address}</span></div>
        <p>{formatDate(todayIso())}</p>
        <p>The Parish Priest<br /><strong>{place}</strong></p>
        <p><strong>RE: NOTIFICATION OF SACRAMENTS FOR NOTATION IN THE BAPTISMAL REGISTER (Can. 535 §2)</strong></p>
        <p>Dear Reverend Father,</p>
        <p>We write to inform you that the following persons, who are recorded as having been baptised in your parish, have received sacraments in this parish. Kindly note them in your Baptismal Register.</p>
        {rows.length === 0 ? <p><em>No pending events for this parish.</em></p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Name", "Parents", "Sacrament", "Date", "Place", "Minister"].map((h) => <th key={h} style={{ border: "1px solid #999", padding: 4, textAlign: "left" }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={`${r.source_type}${r.source_id}${r.party}`}>
                <td style={{ border: "1px solid #999", padding: 4 }}>{r.person}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{[r.father_name, r.mother_name].filter(Boolean).join(" & ") || "—"}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{r.event}{r.partner ? ` to ${r.partner}` : ""}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{r.event_date ? formatDate(r.event_date) : "—"}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{r.event_place ?? "—"}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{r.minister ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p style={{ marginTop: 16 }}>Please acknowledge receipt. Thank you for your cooperation.</p>
        <p>Yours in Christ,</p><p style={{ marginTop: 40 }}>______________________<br />Parish Priest</p>
      </div>
    </>
  );
}
