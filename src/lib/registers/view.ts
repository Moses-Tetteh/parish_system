import "server-only";
import { roleCan, type Role } from "@/lib/auth/permissions";
import { formatDate, formatPartialDate } from "@/lib/dates";
import { LOOKUP_TABLES, REF_TARGETS } from "./registry";
import { lookupOptions, referencedRecordNo } from "./repository";
import type { FieldView } from "./form-model";
import type { FieldDef, RecordRow, RegisterDef } from "./types";

export async function buildFieldViews(def: RegisterDef, role: Role): Promise<FieldView[]> {
  const kinds = [...new Set(def.fields.filter((f) => f.type === "lookup" && f.lookup).map((f) => f.lookup!))];
  const lookups = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await lookupOptions(k)] as const)));
  return def.fields.map((f) => ({
    key: f.key, label: f.label, type: f.type, required: f.required, options: f.options,
    lookup: f.lookup ? lookups[f.lookup] : undefined,
    restricted: !!f.permission && !roleCan(role, f.permission),
  }));
}

/** DB record -> flat string map the form inputs can show. */
export async function recordToFormValues(def: RegisterDef, rec: RecordRow | null, defaults: Record<string, string | number>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ver = rec?.updated_at;
  out._version = ver === null || ver === undefined ? "" : String(ver);
  for (const f of def.fields) {
    if (f.type === "section" || f.type === "display") continue;
    if (f.type === "partial_date") {
      for (const [suffix, k] of [["y", "year"], ["m", "month"], ["d", "day"]] as const) {
        const v = rec?.[`${f.key}_${k}`]; out[`${f.key}__${suffix}`] = v ? String(v) : "";
      }
      continue;
    }
    const raw = rec ? rec[f.key] : defaults[f.key];
    if (raw === null || raw === undefined) { out[f.key] = ""; continue; }
    if (f.type === "date") out[f.key] = String(raw).slice(0, 10);
    else if (f.type === "time") out[f.key] = String(raw).slice(0, 5);
    else if (f.type === "checkbox") out[f.key] = Number(raw) ? "1" : "";
    else if (f.type === "baptism_ref" || f.type === "communion_ref" || f.type === "confirmation_ref")
      out[f.key] = await referencedRecordNo(REF_TARGETS[f.type].table, raw);
    else out[f.key] = String(raw);
  }
  return out;
}

/** Plain-text cell for list tables / CSV. */
export function displayValue(def: RegisterDef, f: FieldDef, rec: RecordRow): string {
  if (f.type === "partial_date") return formatPartialDate(rec[`${f.key}_year`] as number, rec[`${f.key}_month`] as number, rec[`${f.key}_day`] as number);
  const v = rec[f.key];
  if (v === null || v === undefined || v === "") return "";
  if (f.type === "date") return formatDate(String(v));
  if (f.type === "time") return String(v).slice(0, 5);
  if (f.type === "checkbox") return Number(v) ? "Yes" : "No";
  if (f.type === "select" || f.type === "display") return f.options?.[String(v)] ?? String(v);
  if (f.type === "money") return Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2 });
  return String(v);
}

export { LOOKUP_TABLES };
