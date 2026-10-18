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

export function RecordForm({ fields, initial, action, cancelHref, isNew }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.errors?.[k];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {!isNew && <input type="hidden" name="_version" value={initial._version ?? ""} />}
      {state.message && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.message}
          {state.duplicates && (
            <div className="mt-2">
              <ul className="list-disc pl-5">{state.duplicates.map((d) => <li key={d.id}>{d.name} (record #{d.id})</li>)}</ul>
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" name="confirm_duplicate" value="1" className="h-5 w-5" /> This is a different person — save anyway
              </label>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          if (f.type === "section") return <h3 key={f.key + f.label} className="col-span-full mt-2 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-700">{f.label}</h3>;
          const wide = f.type === "textarea";
          const id = `f_${f.key}`;
          const described = err(f.key) ? `${id}_err` : undefined;
          const common = { id, name: f.key, "aria-invalid": !!err(f.key) || undefined, "aria-describedby": described } as const;

          return (
            <div key={f.key} className={wide ? "col-span-full" : ""}>
              {f.type === "checkbox" ? (
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
                  <input type="checkbox" {...common} defaultChecked={!!v(f.key)} className="h-5 w-5" /> {f.label}
                </label>
              ) : (
                <label htmlFor={f.type === "partial_date" ? `${id}__y` : id} className="label">
                  {f.label}{f.required && <span className="text-red-700" aria-hidden> *</span>}
                </label>
              )}

              {f.restricted ? (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">🔒 Restricted</p>
              ) : f.type === "textarea" ? (
                <textarea {...common} rows={3} defaultValue={v(f.key)} className="input" />
              ) : f.type === "select" ? (
                <select {...common} defaultValue={v(f.key)} className="input" required={f.required}>
                  <option value="">— choose —</option>
                  {Object.entries(f.options ?? {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              ) : f.type === "display" ? (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{f.options?.[v(f.key)] ?? "—"}</p>
              ) : f.type === "lookup" ? (
                <select {...common} defaultValue={v(f.key)} className="input">
                  <option value="">— none —</option>
                  {(f.lookup ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              ) : f.type === "partial_date" ? (
                <div className="flex gap-2">
                  <input id={`${id}__y`} name={`${f.key}__y`} inputMode="numeric" placeholder="Year" maxLength={4} defaultValue={v(`${f.key}__y`)} className="input" aria-label={`${f.label} year`} />
                  <input name={`${f.key}__m`} inputMode="numeric" placeholder="Mo" maxLength={2} defaultValue={v(`${f.key}__m`)} className="input w-20" aria-label={`${f.label} month`} />
                  <input name={`${f.key}__d`} inputMode="numeric" placeholder="Day" maxLength={2} defaultValue={v(`${f.key}__d`)} className="input w-20" aria-label={`${f.label} day`} />
                </div>
              ) : f.type === "checkbox" ? null : (
                <input
                  {...common}
                  type={f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                  inputMode={f.type === "number" || f.type === "year" ? "numeric" : f.type === "money" ? "decimal" : undefined}
                  defaultValue={v(f.key)}
                  className="input"
                  required={f.required}
                  maxLength={f.type === "year" ? 4 : undefined}
                />
              )}
              {err(f.key) && <p id={`${id}_err`} className="mt-1 text-sm text-red-700">{err(f.key)}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : isNew ? "Add record" : "Save changes"}</button>
        <Link href={cancelHref} className="btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
