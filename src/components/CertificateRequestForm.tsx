"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import type { CertState } from "@/app/(app)/certificates/actions";

type Props = {
  action: (prev: CertState, fd: FormData) => Promise<CertState>;
  purposes: readonly string[];
  needsSignoff: boolean;
  /** suggested validity date for marriage / ordination (computed on the server from the settings) */
  suggestedValidUntil: string;
  backHref: string;
};

export function CertificateRequestForm({ action, purposes, needsSignoff, suggestedValidUntil, backHref }: Props) {
  const [state, formAction, pending] = useActionState<CertState, FormData>(action, {});
  const valid = useRef<HTMLInputElement>(null);

  if (state.issueId !== undefined) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="flash flash-success">Certificate approved and recorded in the Certificate Log.</div>
        {/* A real form POST opens the PDF in a new tab (a fresh click, so pop-up blockers allow it). */}
        <form method="post" action={`/certificates/${state.issueId}/issue`} target="_blank">
          <button type="submit" className="btn">📄 Issue &amp; open the certificate (PDF)</button>{" "}
          <Link href="/certificates" className="btn btn-secondary">Certificate Log</Link>
        </form>
        <p className="hint">Issuing records who printed it and when. It can be issued once; if it must be printed again, request a new certificate.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card" style={{ maxWidth: 640 }} noValidate>
      {state.error && <div role="alert" className="flash flash-error">{state.error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="requester_name">Requester&apos;s Name <span className="req">*</span></label>
          <input id="requester_name" name="requester_name" type="text" required autoFocus maxLength={150} placeholder="Who is collecting this certificate?" />
        </div>
        <div className="field">
          <label htmlFor="requester_id_shown">ID Shown (optional)</label>
          <input id="requester_id_shown" name="requester_id_shown" type="text" maxLength={100} placeholder="e.g. Ghana Card number" />
        </div>
        <div className="field">
          <label htmlFor="purpose">Purpose <span className="req">*</span></label>
          <select
            id="purpose" name="purpose" required defaultValue=""
            onChange={(e) => {
              if ((e.target.value === "Marriage" || e.target.value === "Ordination / Religious Profession") && valid.current && !valid.current.value) valid.current.value = suggestedValidUntil;
            }}
          >
            <option value="">— Select —</option>
            {purposes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="valid_until">Valid Until</label>
          <input id="valid_until" name="valid_until" type="date" ref={valid} />
          <p className="hint" style={{ marginTop: 4 }}>For marriage and ordination a recent certificate is required, so a validity date is suggested automatically.</p>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : needsSignoff ? "📨 Send for Sign-off" : "📄 Approve & Continue"}</button>{" "}
        <Link href={backHref} className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
