import Link from "next/link";
import { ConfirmForm } from "@/components/ConfirmForm";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { REGISTER_HREF, REGISTER_LABEL, STATUS_LABEL, listIssuances } from "@/lib/certificates/workflow";
import { formatDate } from "@/lib/dates";
import { decideCertificateAction } from "./actions";

export const metadata = { title: "Certificate Log" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const stamp = (v: string | null) => (v ? `${formatDate(v.slice(0, 10))}, ${v.slice(11, 16)}` : "—");

export default async function CertificateLog({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100), registerType = one(sp.register_type), status = one(sp.status);
  const { rows, pending } = await listIssuances(user, { q, registerType, status });
  const canApprove = roleCan(user.role, "certificate.approve");

  return (
    <>
      <h1>Certificate Issuance Log</h1>
      <p className="hint">Every certificate is recorded here: who asked, what ID they showed, the purpose, how long it is valid, who signed it off and who issued it. Entries cannot be edited or deleted.</p>

      {one(sp.requested) && <div role="status" className="flash flash-success">Certificate request recorded. It is waiting for the priest’s sign-off; once approved you can issue it from here.</div>}
      {one(sp.decided) && <div role="status" className="flash flash-success">{one(sp.decided) === "approved" ? "Certificate approved. It can now be issued." : "Certificate request rejected."}</div>}
      {one(sp.error) && <div role="alert" className="flash flash-error">{one(sp.error)}</div>}
      {pending > 0 && (
        <div className="callout callout-warning">
          <strong>{pending} certificate request{pending === 1 ? "" : "s"} waiting for the priest’s sign-off.</strong>{" "}
          <Link href="/certificates?status=pending_approval">Show them</Link>
        </div>
      )}

      <form method="get" className="toolbar" style={{ marginBottom: 20 }}>
        <input type="text" name="q" placeholder="Search requester or record name…" defaultValue={q} maxLength={100} style={{ width: 260 }} aria-label="Search" />
        <select name="register_type" defaultValue={registerType} aria-label="Register">
          <option value="">All Registers</option>
          {Object.entries(REGISTER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-secondary" type="submit">Search / Filter</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Requested</th><th scope="col">Register</th><th scope="col">Record</th><th scope="col">Requester</th><th scope="col">Purpose</th><th scope="col">Valid until</th><th scope="col">Status</th><th scope="col">Sign-off / Issued by</th><th scope="col">Actions</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9}>No certificates{q || registerType || status ? " match this filter" : " have been requested yet"}.</td></tr>}
            {rows.map((r) => {
              const st = r.status;
              const viewHref = REGISTER_HREF[r.registerType]?.(r.recordId);
              return (
                <tr key={r.id}>
                  <td>{stamp(r.requestedAt ?? r.issuedAt)}</td>
                  <td>{REGISTER_LABEL[r.registerType] ?? r.registerType}</td>
                  <td>{r.recordLabel}</td>
                  <td>{r.requesterName}{r.requesterIdShown && <><br /><small>ID: {r.requesterIdShown}</small></>}</td>
                  <td>{r.purpose || "—"}</td>
                  <td>{r.validUntil ? formatDate(r.validUntil) : "—"}</td>
                  <td>
                    <span className={`badge badge-cert-${st}`}>{STATUS_LABEL[st] ?? st}</span>
                    {r.decisionNote && <><br /><small>{r.decisionNote}</small></>}
                  </td>
                  <td>{r.approvedBy || "—"}{st === "issued" && <><br /><small>issued by {r.issuedBy || "—"}</small></>}</td>
                  <td className="row-actions">
                    {st === "pending_approval" && canApprove && (
                      <>
                        <form action={decideCertificateAction.bind(null, r.id, true)} style={{ display: "inline" }}>
                          <button type="submit" className="btn btn-small">✔ Approve</button>
                        </form>
                        <ConfirmForm action={decideCertificateAction.bind(null, r.id, false)} message="Reject this request?" className="inline-form">
                          <button type="submit" className="btn btn-small btn-danger">✖ Reject</button>
                        </ConfirmForm>
                      </>
                    )}
                    {st === "approved" && (
                      <form method="post" action={`/certificates/${r.id}/issue`} target="_blank" style={{ display: "inline" }}>
                        <button type="submit" className="btn btn-small">📄 Issue PDF</button>
                      </form>
                    )}
                    {viewHref && <Link href={viewHref} className="btn btn-small btn-secondary">View Record</Link>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
