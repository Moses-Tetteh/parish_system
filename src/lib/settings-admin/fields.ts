/** Workflow settings: ONE definition drives the form, the validation and the saving (port of settings/workflow.php). Pure, unit-tested. */
export type WorkflowField =
  | { key: string; label: string; type: "bool"; def: "0" | "1"; help: string }
  | { key: string; label: string; type: "int"; def: string; help: string; min: number; max: number };

export const WORKFLOW_FIELDS: WorkflowField[] = [
  { key: "certificate_signoff_required", label: "Require the priest’s sign-off before a certificate is issued", type: "bool", def: "1", help: "When on, a secretary’s certificate requests wait for a priest/admin to approve them." },
  { key: "certificate_marriage_validity_months", label: "Validity of certificates for marriage / ordination (months)", type: "int", def: "6", min: 1, max: 36, help: "A recent baptismal certificate is normally required; this pre-fills the “valid until” date." },
  { key: "sponsor_min_age", label: "Minimum age of a godparent / sponsor", type: "int", def: "16", min: 10, max: 40, help: "Canon 874 §1 — the diocese may set a different age." },
  { key: "candidate_min_attendance_percent", label: "Minimum class attendance before a candidate is ready (%)", type: "int", def: "75", min: 0, max: 100, help: "Used by Sacrament Preparation / RCIA readiness checks." },
  { key: "epiphany_on_sunday", label: "Epiphany is celebrated on the Sunday (not 6 January)", type: "bool", def: "1", help: "Liturgical calendar." },
  { key: "ascension_on_sunday", label: "Ascension is celebrated on the Sunday (not Thursday)", type: "bool", def: "0", help: "Liturgical calendar." },
  { key: "corpus_christi_on_sunday", label: "Corpus Christi is celebrated on the Sunday (not Thursday)", type: "bool", def: "1", help: "Liturgical calendar." },
];

/** Returns the values to store, or the first validation error. `get` reads one raw form value (null = absent). */
export function parseWorkflow(get: (key: string) => string | null): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const f of WORKFLOW_FIELDS) {
    if (f.type === "bool") { values[f.key] = get(f.key) === "1" ? "1" : "0"; continue; }
    const v = (get(f.key) ?? "").trim();
    if (!/^\d{1,4}$/.test(v) || Number(v) < f.min || Number(v) > f.max) return { error: `“${f.label}” must be a number between ${f.min} and ${f.max}.` };
    values[f.key] = String(Number(v));
  }
  return { values };
}
