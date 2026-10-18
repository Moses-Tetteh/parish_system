"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <div role="alert" className="flash flash-error">{state.error}</div>}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn" style={{ width: "100%", marginTop: 6 }} disabled={pending}>{pending ? "Logging in…" : "Log In"}</button>
    </form>
  );
}
