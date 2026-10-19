"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FieldView, FormState } from "@/lib/registers/form-model";
import { hiddenFields, type ExclusiveRule } from "@/lib/registers/exclusive";
import { FieldControl } from "@/components/FieldControl";

type Props = {
  fields: FieldView[];
  initial: Record<string, string>;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cancelHref: string;
  isNew: boolean;
  exclusive?: ExclusiveRule;
};


/**
 * Markup follows the PHP register form (includes/generic_register.php `render_field_grid`):
 * a two-column `.form-grid` of `.field` blocks, `.form-section` headings, `.readonly-field` /
 * `.restricted-field` placeholders, and a 💾 Save / Cancel pair underneath.
 */
export function RecordForm({ fields, initial, action, cancelHref, exclusive }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.errors?.[k];

  // Either-or rule (Holy Matrimony / Holy Orders): the other side is not rendered, so it is not submitted;
  // the server enforces the same rule regardless of what the browser sends.
  const [statusA, setStatusA] = useState(v(exclusive?.a.status ?? ""));
  const [statusB, setStatusB] = useState(v(exclusive?.b.status ?? ""));
  const hidden = exclusive ? hiddenFields(exclusive, statusA, statusB) : new Set<string>();
  const hiddenLabel = exclusive ? (hidden.has(exclusive.a.status) ? exclusive.a.label : hidden.has(exclusive.b.status) ? exclusive.b.label : null) : null;
  const chosenLabel = exclusive && hiddenLabel ? (hiddenLabel === exclusive.a.label ? exclusive.b.label : exclusive.a.label) : null;
  const onChoice = (key: string, value: string) => {
    if (!exclusive) return;
    if (key === exclusive.a.status) setStatusA(value);
    if (key === exclusive.b.status) setStatusB(value);
  };

  return (
    <form action={formAction} noValidate>
      {state.message && (
        <div role="alert" className={state.duplicates ? "callout callout-warning" : "flash flash-error"}>
          {state.message}
          {state.duplicates && (
            <div style={{ marginTop: 8 }}>
              <ul className="plain">{state.duplicates.map((d) => <li key={d.id}>{d.name} (record #{d.id})</li>)}</ul>
              <label className="check-row" style={{ color: "var(--maroon)" }}>
                <input type="checkbox" name="confirm_duplicate" value="1" /> This is a different person — save anyway
              </label>
            </div>
          )}
        </div>
      )}

      <div className="form-grid">
        {fields.map((f, idx) => {
          if (f.type === "section") return <h3 key={`${f.key}-${idx}`} className="form-section">{f.label}</h3>;

          if (hidden.has(f.key)) {
            return f.key === exclusive?.a.status || f.key === exclusive?.b.status ? (
              <div key={f.key} className="field full">
                <p className="hint">{hiddenLabel} is hidden because {chosenLabel} is recorded. Set {chosenLabel} back to “Not yet received” to show it again.</p>
              </div>
            ) : null;
          }

          return <FieldControl key={f.key} f={f} v={v} error={err(f.key)} onSelectChange={(value) => onChoice(f.key, value)} />;
        })}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "💾 Save"}</button>
        <Link href={cancelHref} className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
