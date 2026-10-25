import Link from "next/link";
import { ConfirmForm } from "@/components/ConfirmForm";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { getRegister } from "@/lib/registers/registry";
import { approvalBlockers, bannsDates, checklist } from "@/lib/marriage-prep/rules";
import { getPrep } from "@/lib/marriage-prep/service";
import { prepAction } from "@/app/(app)/workflow/actions";

function Act({ id, act, label, cls = "btn", confirm }: { id: number; act: string; label: string; cls?: string; confirm?: string }) {
  const body = (<><input type="hidden" name="id" value={id} /><input type="hidden" name="do" value={act} /><button className={cls} type="submit">{label}</button></>);
  return confirm ? <ConfirmForm action={prepAction} message={confirm}>{body}</ConfirmForm> : <form action={prepAction} style={{ display: "inline" }}>{body}</form>;
}

/** The file's workflow panel (PHP: marriage_prep_after_form): checklist, approval, the wedding record, cancel/re-open. */
export async function MarriagePrepPanel({ user, id }: { user: SessionUser; id: number }) {
  const p = await getPrep(user, id);
  if (!p) return null;
  const blockers = approvalBlockers(p);
  const statusLabel = getRegister("marriage_prep")?.fields.find((f) => f.key === "status")?.options?.[p.status] ?? p.status;
  const nBanns = bannsDates(p).length, bannsOk = nBanns >= 3 || !!p.bannsDispensed;
  const canApprove = roleCan(user.role, "marriage.approve");
  const open = !["married", "cancelled"].includes(p.status);
  return (
    <div className="card workflow-panel">
      <h2>File status: <span className="badge">{statusLabel}</span></h2>
      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <div>
          <h3>Checklist</h3>
          <ul className="plain-list">
            {checklist(p).map((i) => <li key={i.label} style={{ color: i.done ? "var(--success)" : i.required ? "var(--danger)" : "var(--ink-soft)" }}>{i.done ? "✔" : i.required ? "✘" : "–"} {i.label}{i.required ? "" : " (not required)"}</li>)}
            <li style={{ color: bannsOk ? "var(--success)" : "var(--danger)" }}>{bannsOk ? "✔" : "✘"} Banns published ({nBanns}/3{p.bannsDispensed ? ", dispensed" : ""})</li>
          </ul>
          {nBanns > 0 && <p className="hint">📢 Banns appear in the Sunday announcements automatically (category “Publication of Banns”).</p>}
        </div>
        <div>
          {p.status === "married" ? (
            <p>✅ Recorded in the Matrimony register. <Link href={`/matrimony/${p.matrimonyId}`}>Open the marriage record</Link></p>
          ) : p.status === "cancelled" ? (
            <><p>This file is cancelled.</p><Act id={p.id} act="reopen" label="Re-open file" cls="btn btn-secondary" /></>
          ) : (
            <>
              {p.approvedAt ? (
                <>
                  <p>✔ Approved by <strong>{p.approvedBy}</strong> on {formatDate(p.approvedAt.slice(0, 10))}.</p>
                  {canApprove && <Act id={p.id} act="withdraw" label="Withdraw approval" cls="btn btn-secondary btn-small" confirm="Withdraw the priest’s approval?" />}
                </>
              ) : blockers.length ? (
                <><h3>Before the priest can approve</h3><ul className="plain-list">{blockers.map((b) => <li key={b} style={{ color: "var(--danger)" }}>✘ {b}</li>)}</ul></>
              ) : (
                <><p>✔ Everything required is in place.</p>{canApprove ? <Act id={p.id} act="approve" label="✔ Approve this marriage" /> : <p className="hint">Waiting for the priest’s approval.</p>}</>
              )}
              {p.approvedAt && (
                <>
                  <h3>Record the wedding</h3>
                  <p className="hint">After the celebration, enter the details to create the Matrimony register entry (and the marginal notes on both baptismal entries).</p>
                  <ConfirmForm action={prepAction} message="Create the Matrimony register entry now?">
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="do" value="convert" />
                    <div className="form-grid">
                      <div className="field"><label htmlFor="date_of_marriage">Date of marriage *</label><input id="date_of_marriage" type="date" name="date_of_marriage" required defaultValue={p.proposedDate ?? ""} /></div>
                      <div className="field"><label htmlFor="record_no">Register No.</label><input id="record_no" name="record_no" maxLength={50} /></div>
                      <div className="field"><label htmlFor="place_of_marriage">Place</label><input id="place_of_marriage" name="place_of_marriage" defaultValue={p.placeOfMarriage ?? ""} /></div>
                      <div className="field"><label htmlFor="minister">Minister</label><input id="minister" name="minister" defaultValue={p.officiatingMinister ?? ""} /></div>
                      <div className="field full"><label htmlFor="witnesses">Witnesses</label><input id="witnesses" name="witnesses" defaultValue={p.witnesses ?? ""} /></div>
                    </div>
                    <div style={{ marginTop: 10 }}><button className="btn" type="submit">💍 Create Matrimony record</button></div>
                  </ConfirmForm>
                </>
              )}
              {open && <div style={{ marginTop: 14 }}><Act id={p.id} act="cancel" label="Cancel this file" cls="btn btn-danger btn-small" confirm="Cancel this marriage file? The banns announcements will be removed." /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
