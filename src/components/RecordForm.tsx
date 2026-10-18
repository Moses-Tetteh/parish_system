"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FieldView, FormState } from "@/lib/registers/form-model";

type Props = {
  fields: FieldView[];
  initial: Record<string, string>;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cancelHref: string;
  isNew: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Markup follows the PHP register form (includes/generic_register.php `render_field_grid`):
 * a two-column `.form-grid` of `.field` blocks, `.form-section` headings, `.readonly-field` /
 * `.restricted-field` placeholders, and a 💾 Save / Cancel pair underneath.
 */
export function RecordForm({ fields, initial, action, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.errors?.[k];

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

          const id = `f_${f.key}`;
          const e = err(f.key);
          const wide = f.type === "textarea" || f.type === "partial_date";
          const common = { id, name: f.key, "aria-invalid": !!e || undefined, "aria-describedby": e ? `${id}_err` : undefined, className: e ? "is-invalid" : undefined } as const;

          return (
            <div key={f.key} className={`field${wide ? " full" : ""}`}>
              <label htmlFor={f.type === "partial_date" ? `${id}__d` : id}>{f.label}{f.required && <span className="req"> *</span>}</label>

              {f.restricted ? (
                <div className="restricted-field">🔒 Restricted — priest/admin only</div>
              ) : f.type === "textarea" ? (
                <textarea {...common} rows={3} defaultValue={v(f.key)} />
              ) : f.type === "select" ? (
                <select {...common} defaultValue={v(f.key)} required={f.required}>
                  <option value="">— Select —</option>
                  {Object.entries(f.options ?? {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              ) : f.type === "display" ? (
                <div className="readonly-field">{f.options?.[v(f.key)] ?? (v(f.key) || "—")}</div>
              ) : f.type === "lookup" ? (
                <select {...common} defaultValue={v(f.key)}>
                  <option value="">— None —</option>
                  {(f.lookup ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <input {...common} type="checkbox" value="1" defaultChecked={!!v(f.key)} />
              ) : f.type === "partial_date" ? (
                <>
                  <div className="partial-date">
                    <select id={`${id}__d`} name={`${f.key}__d`} defaultValue={v(`${f.key}__d`)} aria-label={`${f.label} day`}>
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select name={`${f.key}__m`} defaultValue={v(`${f.key}__m`)} aria-label={`${f.label} month`}>
                      <option value="">Month</option>
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <input name={`${f.key}__y`} type="number" placeholder="Year" min={1850} max={2100} defaultValue={v(`${f.key}__y`)} aria-label={`${f.label} year`} className={e ? "is-invalid" : undefined} />
                  </div>
                  <p className="hint" style={{ marginTop: 4 }}>Leave Day and/or Month blank if not known — Year alone, or Month + Year, is fine.</p>
                </>
              ) : (
                <input
                  {...common}
                  type={f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "number" || f.type === "year" || f.type === "money" ? "number" : "text"}
                  step={f.type === "money" ? "0.01" : f.type === "number" || f.type === "year" ? "1" : undefined}
                  min={f.type === "year" ? 1850 : f.type === "number" || f.type === "money" ? 0 : undefined}
                  max={f.type === "year" ? 2100 : undefined}
                  placeholder={f.type === "year" ? "YYYY" : f.type === "money" ? "0.00" : undefined}
                  defaultValue={v(f.key)}
                  required={f.required}
                />
              )}
              {e && <p id={`${id}_err`} className="field-error">{e}</p>}
            </div>
          );
        })}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "💾 Save"}</button>
        <Link href={cancelHref} className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
