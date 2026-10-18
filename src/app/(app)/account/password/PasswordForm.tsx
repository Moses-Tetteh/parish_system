"use client";
import { useActionState } from "react";
import { changePasswordAction, type PwState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PwState, FormData>(changePasswordAction, {});
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      {state.error && <div role="alert" className="flash flash-error">{state.error}</div>}
      {state.ok && <div role="status" className="flash flash-success">Password changed. Other devices have been signed out.</div>}
      <form action={action}>
        <div className="field"><label htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
        <div className="field"><label htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} /></div>
        <p className="hint" style={{ marginTop: -4 }}>At least 10 characters with upper-case, lower-case and a number.</p>
        <div className="field"><label htmlFor="confirm">Repeat new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "💾 Update Password"}</button>
      </form>
    </div>
  );
}
