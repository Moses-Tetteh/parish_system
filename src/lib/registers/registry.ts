import "server-only";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { schema } from "@/db";
import { REGISTER_DEFS } from "./definitions.generated";
import type { FieldDef, RegisterDef } from "./types";

// Registers switched off in the UI (Death Register covers burials). Data stays in the database; remove a key to bring one back.
const DISABLED_REGISTERS = new Set(["burial_records", "mass_intentions"]);
const ACTIVE_DEFS = REGISTER_DEFS.filter((d) => !DISABLED_REGISTERS.has(d.key));

const byKey = new Map<string, RegisterDef>(ACTIVE_DEFS.map((d) => [d.key, d]));

export function getRegister(key: string): RegisterDef | undefined {
  return byKey.get(key);
}

export function allRegisters(): RegisterDef[] {
  return ACTIVE_DEFS;
}

// ---- table / column resolution (the ONLY place that touches Drizzle's dynamic typing) ----
const tableByName = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (is(value, PgTable)) tableByName.set(getTableName(value), value);
}

export interface ResolvedTable {
  table: PgTable;
  /** db column name -> {js property, column} */
  columns: Map<string, { prop: string; col: PgColumn }>;
}

const resolved = new Map<string, ResolvedTable>();

export function resolveTable(name: string): ResolvedTable {
  const hit = resolved.get(name);
  if (hit) return hit;
  const table = tableByName.get(name);
  if (!table) throw new Error(`Unknown table: ${name}`);
  const columns = new Map<string, { prop: string; col: PgColumn }>();
  for (const [prop, col] of Object.entries(getTableColumns(table))) columns.set(col.name, { prop, col: col as PgColumn });
  const r = { table, columns };
  resolved.set(name, r);
  return r;
}

/** DB columns that back one logical field (partial dates span three). */
export function fieldColumns(field: FieldDef): string[] {
  switch (field.type) {
    case "partial_date": return [`${field.key}_year`, `${field.key}_month`, `${field.key}_day`];
    case "section": return [];
    default: return [field.key];
  }
}

export const REF_TARGETS = {
  baptism_ref: { table: "baptism_records", label: "baptism" },
  communion_ref: { table: "communion_records", label: "communion" },
  confirmation_ref: { table: "confirmation_records", label: "confirmation" },
} as const;

export const LOOKUP_TABLES: Record<NonNullable<FieldDef["lookup"]>, { table: string; labelColumns: string[] }> = {
  outstation: { table: "outstations", labelColumns: ["name"] },
  household: { table: "households", labelColumns: ["household_name"] },
  baptism: { table: "baptism_records", labelColumns: ["given_name", "surname"] },
  communion: { table: "communion_records", labelColumns: ["full_name"] },
  confirmation: { table: "confirmation_records", labelColumns: ["full_name"] },
  death: { table: "death_records", labelColumns: ["full_name"] },
  holy_orders: { table: "holy_orders", labelColumns: ["full_name"] },
};
