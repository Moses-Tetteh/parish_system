"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FieldControl } from "@/components/FieldControl";
import type { FieldView, FormState } from "@/lib/registers/form-model";

type Props = {
  marriageFields: FieldView[];
  spouseFields: FieldView[];
  /** Flat string map: marriage keys as-is, spouse keys prefixed groom_ / bride_. */
  initial: Record<string, string>;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cancelHref: string;
  isEdit: boolean;
};

/** Layout follows the PHP page (public/matrimony/form.php): Marriage Details, then Groom | Bride side by side. */
export function MatrimonyForm({ marriageFields, spouseFields, initial, action, cancelHref, isEdit }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.errors?.[k];

  return (
    <form action={formAction} noValidate>
      {isEdit && <input type="hidden" name="_version" value={initial._version ?? ""} />}
      {state.message && <div role="alert" className="flash flash-error">{state.message}</div>}

      <div className="card">
        <h2>Marriage Details</h2>
        <div className="form-grid">
          {marriageFields.map((f) => <FieldControl key={f.key} f={f} v={v} error={err(f.key)} />)}
        </div>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {(["groom", "bride"] as const).map((role) => (
          <div className="card" key={role}>
            <h3>{role === "groom" ? "Groom" : "Bride"}</h3>
            {spouseFields.map((f) => <FieldControl key={f.key} f={f} name={`${role}_${f.key}`} v={v} error={err(`${role}_${f.key}`)} />)}
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "💾 Save"}</button>
        <Link href={cancelHref} className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
