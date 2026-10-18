"use client";
import { useActionState } from "react";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import { createUserAction, resetPasswordAction, type UserFormState } from "./actions";

export function CreateUserForm() {
  const [s, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  return (
    <div className="card">
      <h2>Add a User</h2>
      {s.error && <div role="alert" className="flash flash-error">{s.error}</div>}
      {s.ok && <div role="status" className="flash flash-success">{s.ok}</div>}
      <form action={action} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 160 }}><label htmlFor="nu">Username</label><input id="nu" name="username" type="text" required autoComplete="off" autoCapitalize="none" /></div>
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}><label htmlFor="nf">Full name</label><input id="nf" name="fullName" type="text" autoComplete="off" /></div>
        <div className="field" style={{ marginBottom: 0, minWidth: 150 }}><label htmlFor="nr">Role</label>
          <select id="nr" name="role" defaultValue="secretary">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0, minWidth: 150 }}><label htmlFor="np">Temporary password</label><input id="np" name="password" type="password" required autoComplete="new-password" /></div>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "➕ Add User"}</button>
      </form>
      <p className="hint">Passwords must be at least 10 characters with upper-case, lower-case and a number. The new user can change their own password anytime from the account menu, top right.</p>
    </div>
  );
}

export function RoleForm({ id, role, action }: { id: number; role: string; action: (fd: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="inline-form">
      <label className="sr-only" htmlFor={`r${id}`}>Role</label>
      <select id={`r${id}`} name="role" defaultValue={role}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
      <button className="btn btn-small btn-secondary" type="submit">Set role</button>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: number }) {
  const [s, action, pending] = useActionState<UserFormState, FormData>(resetPasswordAction.bind(null, id), {});
  return (
    <form action={action} className="inline-form">
      <label className="sr-only" htmlFor={`rp${id}`}>New password</label>
      <input id={`rp${id}`} name="password" type="password" placeholder="New password" autoComplete="new-password" required />
      <button className="btn btn-small btn-secondary" type="submit" disabled={pending}>Reset</button>
      {s.error && <span role="alert" className="field-error" style={{ margin: 0 }}>{s.error}</span>}
      {s.ok && <span role="status" className="pill ok">{s.ok}</span>}
    </form>
  );
}
