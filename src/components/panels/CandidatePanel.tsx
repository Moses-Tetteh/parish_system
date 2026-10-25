import { ConfirmForm } from "@/components/ConfirmForm";
import { ParishionerPicker } from "@/components/ParishionerPicker";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { formatDate, todayIso } from "@/lib/dates";
import { SPONSOR_PROGRAMS } from "@/lib/candidates/rules";
import { attendanceFor, getCandidate, readinessFor, sponsorsFor } from "@/lib/candidates/service";
import { candidateAction } from "@/app/(app)/workflow/actions";

const PILL: Record<string, { background: string; color: string }> = { eligible: { background: "#eaf4ee", color: "var(--success)" }, needs_review: { background: "#fdf3dd", color: "#8a6100" }, ineligible: { background: "#faeced", color: "var(--danger)" } };

function Hidden({ cid, act, extra }: { cid: number; act: string; extra?: Record<string, string | number> }) {
  return (<><input type="hidden" name="candidate_id" value={cid} /><input type="hidden" name="do" value={act} />{Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>);
}

/** Preparation panel on the candidate's file (PHP: candidate_after_form): attendance, readiness, sponsors, entering the register. */
export async function CandidatePanel({ user, id }: { user: SessionUser; id: number }) {
  const c = await getCandidate(user, id);
  if (!c) return null;
  const [att, blockers, sponsors] = await Promise.all([attendanceFor(id), readinessFor(c), sponsorsFor(id)]);
  const usesSponsors = SPONSOR_PROGRAMS.includes(c.program), promoted = c.candidateStatus === "promoted", isRcia = c.program === "rcia";
  const canOverride = roleCan(user.role, "sponsor.override");
  return (
    <div className="card workflow-panel">
      <h2>Preparation</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <div>
          <h3>Attendance</h3>
          <p>{att.percent === null ? "No sessions recorded yet." : <><strong>{att.percent}%</strong> ({att.present} of {att.held} sessions)</>}</p>
          <h3>Ready to enter in the register?</h3>
          {promoted ? <p>✅ {c.promotedSummary} on {c.promotedOn ? formatDate(c.promotedOn) : ""}.</p>
            : blockers.length ? <ul className="plain-list">{blockers.map((b) => <li key={b} style={{ color: "var(--danger)" }}>✘ {b}</li>)}</ul> : <p>✔ All requirements met.</p>}
        </div>
        <div>
          {usesSponsors && (
            <>
              <h3>Godparents / sponsors</h3>
              {sponsors.length === 0 ? <p className="hint">None recorded yet.</p> : (
                <ul className="plain-list">
                  {sponsors.map((s) => (
                    <li key={s.id} style={{ marginBottom: 10 }}>
                      <strong>{s.sponsorName}</strong> <small>({s.sponsorRole})</small> <span className="badge" style={PILL[s.eligibility]}>{s.eligibility.replace("_", " ")}</span>
                      {s.eligibilityIssues && <><br /><small>{s.eligibilityIssues}</small></>}
                      {s.overrideBy && <><br /><small>Overridden by {s.overrideBy}: {s.overrideReason}</small></>}
                      <div className="row-actions">
                        {s.eligibility !== "eligible" && canOverride && (
                          <form action={candidateAction} className="inline-form"><Hidden cid={id} act="override_sponsor" extra={{ sponsor_id: s.id }} /><input name="reason" placeholder="Reason to override" required maxLength={500} aria-label="Reason to override" /><button className="btn btn-small" type="submit">Override</button></form>
                        )}
                        <ConfirmForm action={candidateAction} message="Remove this sponsor?"><Hidden cid={id} act="delete_sponsor" extra={{ sponsor_id: s.id }} /><button className="btn btn-small btn-danger" type="submit">Remove</button></ConfirmForm>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!promoted && (
                <details>
                  <summary>➕ Add a sponsor</summary>
                  <form action={candidateAction}>
                    <Hidden cid={id} act="add_sponsor" />
                    <div className="form-grid">
                      <ParishionerPicker name="parishioner_id" label="Pick from the parish list (auto-checks eligibility)" />
                      <div className="field"><label htmlFor="sponsor_name">or type the name</label><input id="sponsor_name" name="sponsor_name" maxLength={250} /></div>
                      <div className="field"><label htmlFor="sponsor_role">Role</label><select id="sponsor_role" name="sponsor_role"><option value="godfather">Godfather</option><option value="godmother">Godmother</option><option value="sponsor">Sponsor</option></select></div>
                      <div className="field"><label htmlFor="sponsor_age">Age</label><input id="sponsor_age" type="number" name="sponsor_age" min={0} max={120} /></div>
                      <div className="field full">
                        {([["is_catholic", "Catholic", true], ["is_confirmed", "Confirmed", false], ["has_received_eucharist", "Received Holy Communion", false], ["is_practising", "Practising", false], ["marriage_regular", "Marriage regular", true], ["is_parent_of_candidate", "Is a parent of the candidate", false]] as const).map(([k, l, d]) => (
                          <label key={k} className="check-inline" style={{ marginRight: 12 }}><input type="checkbox" name={k} value="1" defaultChecked={d} /> {l}</label>
                        ))}
                      </div>
                    </div>
                    <p className="hint">The tick-boxes are used only when nobody is picked from the parish list.</p>
                    <button className="btn btn-small" type="submit">Check &amp; add</button>
                  </form>
                </details>
              )}
            </>
          )}
        </div>
      </div>
      {!promoted && c.candidateStatus === "active" && (
        <>
          <hr />
          <h3>Enter in the sacramental register</h3>
          {blockers.length > 0 && <p className="hint">Resolve the items above first — the register entry is created from this file, so nothing needs retyping.</p>}
          <ConfirmForm action={candidateAction} message="Create the register entries now?">
            <Hidden cid={id} act="promote" />
            <div className="form-grid">
              <div className="field"><label htmlFor="pdate">Date celebrated *</label><input id="pdate" type="date" name="date" required defaultValue={c.plannedDate ?? todayIso()} /></div>
              <div className="field"><label htmlFor="pmin">Minister</label><input id="pmin" name="minister" maxLength={250} /></div>
              <div className="field"><label htmlFor="pplace">Place (blank = this parish)</label><input id="pplace" name="place" maxLength={250} /></div>
              <div className="field"><label htmlFor="prec">Register No.</label><input id="prec" name="record_no" maxLength={50} /></div>
              {isRcia && (
                <div className="field full">
                  <label className="check-inline" style={{ marginRight: 12 }}><input type="checkbox" name="with_baptism" value="1" defaultChecked={!c.baptismId} disabled={!!c.baptismId} /> Baptism</label>
                  <label className="check-inline" style={{ marginRight: 12 }}><input type="checkbox" name="with_confirmation" value="1" defaultChecked /> Confirmation</label>
                  <label className="check-inline"><input type="checkbox" name="with_communion" value="1" defaultChecked /> First Holy Communion</label>
                </div>
              )}
              {canOverride && blockers.length > 0 && <div className="field full"><label className="check-inline"><input type="checkbox" name="force" value="1" /> Override the requirements (priest/admin)</label></div>}
            </div>
            <div style={{ marginTop: 10 }}><button className="btn" type="submit">📖 Enter in the register</button></div>
          </ConfirmForm>
          <div style={{ marginTop: 14 }}>
            <ConfirmForm action={candidateAction} message="Mark this candidate as withdrawn?"><Hidden cid={id} act="withdraw" /><button className="btn btn-secondary btn-small" type="submit">Mark as withdrawn</button></ConfirmForm>
          </div>
        </>
      )}
    </div>
  );
}
