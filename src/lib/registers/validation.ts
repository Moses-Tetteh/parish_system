import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { roleCan, type Role } from "@/lib/auth/permissions";
import { isValidIsoDate, isValidTime, todayIso } from "@/lib/dates";
import { LOOKUP_TABLES, REF_TARGETS, resolveTable } from "./registry";
import type { FieldDef, RegisterDef } from "./types";

export type Values = Record<string, string | number | null>;
export type FieldErrors = Record<string, string>;

const LONG_TEXT = 20000;

function maxLen(def: RegisterDef, key: string, fallback: number): number {
  const col = resolveTable(def.table).columns.get(key)?.col as { length?: number } | undefined;
  return typeof col?.length === "number" ? col.length : fallback;
}

function str(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Fields the given role is allowed to WRITE (restricted fields are dropped => can never be overwritten). */
export function writableFields(def: RegisterDef, role: Role): FieldDef[] {
  return def.fields.filter(
    (f) => f.type !== "section" && f.type !== "display" && (!f.permission || roleCan(role, f.permission)),
  );
}

/**
 * Turns raw form input into DB-ready values. Whitelist-driven: only fields declared in the register
 * definition (and permitted for the role) are ever read, so extra form keys cannot reach the database
 * (mass-assignment protection), and every value is type-checked against its field type.
 */
export async function parseForm(def: RegisterDef, role: Role, fd: FormData): Promise<{ values: Values; errors: FieldErrors }> {
  const values: Values = {};
  const errors: FieldErrors = {};

  for (const f of writableFields(def, role)) {
    const raw = str(fd, f.key);
    const need = () => { if (f.required) errors[f.key] = `${shortLabel(f)} is required.`; };

    switch (f.type) {
      case "text": {
        const max = maxLen(def, f.key, 255);
        if (!raw) { need(); values[f.key] = null; }
        else if (raw.length > max) errors[f.key] = `${shortLabel(f)} must be at most ${max} characters.`;
        else values[f.key] = raw;
        break;
      }
      case "textarea": {
        if (!raw) { need(); values[f.key] = null; }
        else if (raw.length > LONG_TEXT) errors[f.key] = `${shortLabel(f)} is too long.`;
        else values[f.key] = raw;
        break;
      }
      case "date": {
        if (!raw) { need(); values[f.key] = null; }
        else if (!isValidIsoDate(raw)) errors[f.key] = `${shortLabel(f)} is not a valid date.`;
        else values[f.key] = raw;
        break;
      }
      case "time": {
        if (!raw) { need(); values[f.key] = null; }
        else if (!isValidTime(raw)) errors[f.key] = `${shortLabel(f)} is not a valid time.`;
        else values[f.key] = raw.length === 5 ? `${raw}:00` : raw;
        break;
      }
      case "number": {
        if (!raw) { need(); values[f.key] = null; }
        else if (!/^-?\d{1,9}$/.test(raw)) errors[f.key] = `${shortLabel(f)} must be a whole number.`;
        else values[f.key] = Number(raw);
        break;
      }
      case "year": {
        if (!raw) { need(); values[f.key] = null; }
        else if (!/^\d{4}$/.test(raw) || Number(raw) < 1000 || Number(raw) > 2200) errors[f.key] = `${shortLabel(f)} must be a 4-digit year.`;
        else values[f.key] = Number(raw);
        break;
      }
      case "money": {
        if (!raw) { need(); values[f.key] = null; }
        else if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw.replace(/,/g, ""))) errors[f.key] = `${shortLabel(f)} must be an amount like 120.50.`;
        else values[f.key] = raw.replace(/,/g, "");
        break;
      }
      case "checkbox": {
        values[f.key] = raw === "on" || raw === "1" ? 1 : 0;
        break;
      }
      case "select": {
        const keys = Object.keys(f.options ?? {});
        if (!raw) { need(); values[f.key] = null; }
        else if (!keys.includes(raw)) errors[f.key] = `${shortLabel(f)} has an invalid choice.`;
        else values[f.key] = isIntColumn(def, f.key) ? Number(raw) : raw;
        break;
      }
      case "lookup": {
        if (!raw) { need(); values[f.key] = null; break; }
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) { errors[f.key] = `${shortLabel(f)} is invalid.`; break; }
        if (!(await rowExists(f.lookup!, id))) { errors[f.key] = `${shortLabel(f)} was not found.`; break; }
        values[f.key] = id;
        break;
      }
      case "baptism_ref":
      case "communion_ref":
      case "confirmation_ref": {
        if (!raw) { need(); values[f.key] = null; break; }
        const id = await findIdByRecordNo(REF_TARGETS[f.type].table, raw);
        if (id === null) errors[f.key] = `No ${REF_TARGETS[f.type].label} record has the number "${raw}".`;
        else values[f.key] = id;
        break;
      }
      case "partial_date": {
        const y = str(fd, `${f.key}__y`), m = str(fd, `${f.key}__m`), d = str(fd, `${f.key}__d`);
        const yn = y ? Number(y) : null, mn = m ? Number(m) : null, dn = d ? Number(d) : null;
        if (y && (!/^\d{4}$/.test(y) || yn! < 1000 || yn! > 2200)) errors[f.key] = `${shortLabel(f)}: year must have 4 digits.`;
        else if (m && (!/^\d{1,2}$/.test(m) || mn! < 1 || mn! > 12)) errors[f.key] = `${shortLabel(f)}: month must be 1-12.`;
        else if (d && (!/^\d{1,2}$/.test(d) || dn! < 1 || dn! > 31)) errors[f.key] = `${shortLabel(f)}: day must be 1-31.`;
        else if ((m && !y) || (d && !m)) errors[f.key] = `${shortLabel(f)}: a month needs a year, and a day needs a month.`;
        else if (yn && mn && dn && !isValidIsoDate(`${y}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`)) errors[f.key] = `${shortLabel(f)} is not a real date.`;
        else if (!y) { need(); }
        values[`${f.key}_year`] = yn; values[`${f.key}_month`] = mn; values[`${f.key}_day`] = dn;
        break;
      }
    }
  }
  return { values, errors };
}

/** Defaults shown on a brand-new form. */
export function initialValues(def: RegisterDef): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(def.defaults ?? {})) out[k] = v === "__today__" ? todayIso() : v;
  return out;
}

export function shortLabel(f: FieldDef): string {
  return f.label.replace(/\s*\(.*?\)\s*/g, " ").replace(/^.*?—\s*/, "").trim() || f.label;
}

function isIntColumn(def: RegisterDef, key: string): boolean {
  const t = (resolveTable(def.table).columns.get(key)?.col as { columnType?: string } | undefined)?.columnType ?? "";
  return /Int|Serial|Numeric/i.test(t);
}

async function rowExists(kind: keyof typeof LOOKUP_TABLES, id: number): Promise<boolean> {
  const { table } = resolveTable(LOOKUP_TABLES[kind].table);
  const idCol = resolveTable(LOOKUP_TABLES[kind].table).columns.get("id")!.col;
  const rows = await db().select({ n: sql<number>`1` }).from(table).where(eq(idCol, id)).limit(1);
  return rows.length > 0;
}

export async function findIdByRecordNo(tableName: string, recordNo: string): Promise<number | null> {
  const t = resolveTable(tableName);
  const rn = t.columns.get("record_no")!.col, id = t.columns.get("id")!.col, arch = t.columns.get("is_archived")!.col;
  const rows = await db().select({ id }).from(t.table).where(and(eq(rn, recordNo), isNotNull(rn), eq(arch, 0))).limit(2);
  return rows.length === 1 ? (rows[0] as { id: number }).id : null;
}
