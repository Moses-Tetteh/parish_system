import { one, type SP } from "@/lib/forms";

/** Renders the ?ok= / ?error= message set by lib/forms.ts back(). Text only (React escapes it). */
export function Notice({ sp }: { sp: SP }) {
  const ok = one(sp.ok).slice(0, 300), error = one(sp.error).slice(0, 300);
  return (
    <>
      {ok && <div role="status" className="flash flash-success">{ok}</div>}
      {error && <div role="alert" className="flash flash-error">{error}</div>}
    </>
  );
}
