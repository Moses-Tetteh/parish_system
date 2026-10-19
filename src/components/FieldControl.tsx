import type { FieldView } from "@/lib/registers/form-model";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * One labelled form field (label + control + error). Shared by RecordForm (generic registers) and
 * MatrimonyForm (groom / bride panels use `name="groom_given_name"` etc.), so the markup, accessibility
 * and styling live in exactly one place.
 *
 * Markup follows the PHP register form (includes/generic_register.php `render_field_grid`).
 */
export function FieldControl({
  f, name, v, error, onSelectChange,
}: {
  f: FieldView;
  /** Form-field name; defaults to the field key. Prefix it to render the same field twice on one page. */
  name?: string;
  v: (key: string) => string;
  error?: string;
  onSelectChange?: (value: string) => void;
}) {
  const key = name ?? f.key;
  const id = `f_${key}`;
  const e = error;
  const wide = f.type === "textarea" || f.type === "partial_date";
  const common = { id, name: key, "aria-invalid": !!e || undefined, "aria-describedby": e ? `${id}_err` : undefined, className: e ? "is-invalid" : undefined } as const;

  return (
    <div className={`field${wide ? " full" : ""}`}>
      <label htmlFor={f.type === "partial_date" ? `${id}__d` : id}>{f.label}{f.required && <span className="req"> *</span>}</label>

      {f.restricted ? (
        <div className="restricted-field">🔒 Restricted — priest/admin only</div>
      ) : f.type === "textarea" ? (
        <textarea {...common} rows={3} defaultValue={v(key)} />
      ) : f.type === "select" ? (
        <select {...common} defaultValue={v(key)} required={f.required} onChange={onSelectChange ? (ev) => onSelectChange(ev.target.value) : undefined}>
          <option value="">— Select —</option>
          {Object.entries(f.options ?? {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      ) : f.type === "display" ? (
        <div className="readonly-field">{f.options?.[v(key)] ?? (v(key) || "—")}</div>
      ) : f.type === "lookup" ? (
        <select {...common} defaultValue={v(key)}>
          <option value="">— None —</option>
          {(f.lookup ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : f.type === "checkbox" ? (
        <input {...common} type="checkbox" value="1" defaultChecked={!!v(key)} />
      ) : f.type === "partial_date" ? (
        <>
          <div className="partial-date">
            <select id={`${id}__d`} name={`${key}__d`} defaultValue={v(`${key}__d`)} aria-label={`${f.label} day`}>
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select name={`${key}__m`} defaultValue={v(`${key}__m`)} aria-label={`${f.label} month`}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input name={`${key}__y`} type="number" placeholder="Year" min={1850} max={2100} defaultValue={v(`${key}__y`)} aria-label={`${f.label} year`} className={e ? "is-invalid" : undefined} />
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
          defaultValue={v(key)}
          required={f.required}
        />
      )}
      {e && <p id={`${id}_err`} className="field-error">{e}</p>}
    </div>
  );
}
