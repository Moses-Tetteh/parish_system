"use client";
import { useActionState } from "react";
import { changePasswordAction, type PwState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PwState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="card max-w-md space-y-4">
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">Password changed. Other devices have been signed out.</p>}
      <div><label htmlFor="current" className="label">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" className="input" required /></div>
      <div><label htmlFor="next" className="label">New password</label><input id="next" name="next" type="password" autoComplete="new-password" className="input" required minLength={10} />
        <p className="mt-1 text-xs text-slate-500">At least 10 characters with upper-case, lower-case and a number.</p></div>
      <div><label htmlFor="confirm" className="label">Repeat new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" required /></div>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
