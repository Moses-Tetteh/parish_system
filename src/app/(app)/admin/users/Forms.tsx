"use client";
import { useActionState } from "react";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import { createUserAction, resetPasswordAction, type UserFormState } from "./actions";

export function CreateUserForm() {
  const [s, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  return (
    <form action={action} className="card grid gap-3 sm:grid-cols-2">
      <h2 className="col-span-full font-semibold">Add a user</h2>
      {s.error && <p role="alert" className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{s.error}</p>}
      {s.ok && <p role="status" className="col-span-full rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">{s.ok}</p>}
      <div><label className="label" htmlFor="nu">Username</label><input id="nu" name="username" className="input" required autoComplete="off" autoCapitalize="none" /></div>
      <div><label className="label" htmlFor="nf">Full name</label><input id="nf" name="fullName" className="input" autoComplete="off" /></div>
      <div><label className="label" htmlFor="nr">Role</label>
        <select id="nr" name="role" className="input" defaultValue="secretary">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
      <div><label className="label" htmlFor="np">Temporary password</label><input id="np" name="password" type="password" className="input" required autoComplete="new-password" /></div>
      <div className="col-span-full"><button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create user"}</button></div>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: number }) {
  const [s, action, pending] = useActionState<UserFormState, FormData>(resetPasswordAction.bind(null, id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`rp${id}`}>New password</label>
      <input id={`rp${id}`} name="password" type="password" placeholder="New password" className="input !w-44" autoComplete="new-password" required />
      <button className="btn-secondary !min-h-9" disabled={pending}>Reset</button>
      {s.error && <span role="alert" className="text-xs text-red-700">{s.error}</span>}
      {s.ok && <span role="status" className="text-xs text-green-800">{s.ok}</span>}
    </form>
  );
}
