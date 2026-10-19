import "server-only";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { logAccess, logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import { isValidVersion } from "./concurrency";
import type { SessionUser } from "@/lib/auth/session";
import { LOOKUP_TABLES, resolveTable } from "./registry";
import { nameKey } from "@/lib/parishioners/name-matcher";
import type { RecordRow, RegisterDef } from "./types";
import type { Values } from "./validation";

export const PAGE_SIZE = 25;
/** Serverless functions have a time/memory budget: cap exports instead of risking a timeout. */
export const EXPORT_ROW_CAP = 20_000;

export class ForbiddenError extends Error {
  constructor() { super("You do not have permission to do that."); }
}

/** Repository-level guard: even if a caller forgets requirePermission(), data access still refuses. */
function assertAllowed(def: RegisterDef, user: SessionUser): void {
  if (!roleCan(user.role, def.permission)) throw new ForbiddenError();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ListQuery {
  q?: string;
  filters?: Record<string, string>;
  from?: string;
  to?: string;
  archived?: boolean;
  serving?: "serving" | "past" | "";
  page?: number;
}

function buildWhere(def: RegisterDef, query: ListQuery): SQL | undefined {
  const t = resolveTable(def.table);
  const col = (name: string) => t.columns.get(name)?.col;
  const conds: SQL[] = [];

  const archivedCol = col("is_archived");
  if (archivedCol) conds.push(eq(archivedCol, query.archived ? 1 : 0));

  const q = query.q?.trim();
  if (q) {
    const searchCols = [def.searchField, ...(t.columns.has("record_no") ? ["record_no"] : []), ...(def.key === "baptism" ? ["given_name"] : [])];
    const ors = [...new Set(searchCols)].map((c) => col(c)).filter(Boolean).map((c) => ilike(c!, `%${escapeLike(q)}%`));
    if (ors.length) conds.push(or(...ors)!);
  }
  for (const key of def.filters ?? []) {
    const v = query.filters?.[key];
    const c = col(key);
    const field = def.fields.find((f) => f.key === key);
    if (v && c && field?.options && Object.hasOwn(field.options, v)) conds.push(eq(c, v));
  }
  if (def.dateFilter) {
    const c = col(def.dateFilter);
    if (c && query.from) conds.push(gte(c, query.from));
    if (c && query.to) conds.push(lte(c, query.to));
  }
  if (def.serviceStatusField && query.serving) {
    const c = col(def.serviceStatusField);
    if (c) conds.push(query.serving === "serving" ? or(isNull(c), gte(c, sql`CURRENT_DATE`))! : and(isNotNull(c), sql`${c} < CURRENT_DATE`)!);
  }
  return conds.length ? and(...conds) : undefined;
}

function buildOrder(def: RegisterDef) {
  const t = resolveTable(def.table);
  const order = (def.orderBy ?? [[def.listColumns[0] ?? "id", "asc"]]).flatMap(([c, d]) => {
    const col = t.columns.get(c)?.col;
    return col ? [d === "desc" ? desc(col) : asc(col)] : [];
  });
  return [...order, desc(t.columns.get("id")!.col)];
}

/** Maps a DB row (JS property names) back to snake_case keys the definitions use. */
function toRecord(def: RegisterDef, row: Record<string, unknown>): RecordRow {
  const t = resolveTable(def.table);
  const out: Record<string, unknown> = {};
  for (const [dbName, { prop }] of t.columns) out[dbName] = row[prop];
  return out as RecordRow;
}

export async function listRecords(def: RegisterDef, user: SessionUser, query: ListQuery) {
  assertAllowed(def, user);
  const t = resolveTable(def.table);
  const where = buildWhere(def, query);
  const page = Math.max(1, Math.floor(query.page ?? 1));

  const [{ total } = { total: 0 }] = await db().select({ total: sql<number>`count(*)` }).from(t.table).where(where);
  const rows = await db().select().from(t.table).where(where).orderBy(...buildOrder(def)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);

  if (def.sensitive) await logAccess({ username: user.username, role: user.role, action: "view", resource: def.key, detail: query.q ? `search: ${query.q}`.slice(0, 300) : "list" });
  return { rows: rows.map((r) => toRecord(def, r as Record<string, unknown>)), total: Number(total), page, pageSize: PAGE_SIZE };
}

export async function getRecord(def: RegisterDef, user: SessionUser, id: number): Promise<RecordRow | null> {
  assertAllowed(def, user);
  const t = resolveTable(def.table);
  const [row] = await db().select().from(t.table).where(eq(t.columns.get("id")!.col, id)).limit(1);
  if (!row) return null;
  if (def.sensitive) await logAccess({ username: user.username, role: user.role, action: "view", resource: def.key, recordId: id });
  return toRecord(def, row as Record<string, unknown>);
}

/** Converts snake_case values to Drizzle property names, dropping anything that is not a real column. */
function toProps(def: RegisterDef, values: Values): Record<string, unknown> {
  const t = resolveTable(def.table);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const c = t.columns.get(k);
    if (c) out[c.prop] = v;
  }
  // The Parishioners sync matches people on the normalised name, so it is derived on every write (never typed).
  if (def.key === "parishioners" && typeof values.full_name === "string") {
    const nk = t.columns.get("name_key");
    if (nk) out[nk.prop] = nameKey(values.full_name) || null;
  }
  return out;
}

export async function createRecord(def: RegisterDef, user: SessionUser, values: Values): Promise<number> {
  assertAllowed(def, user);
  const t = resolveTable(def.table);
  const props = toProps(def, values);
  if (t.columns.has("created_by")) props[t.columns.get("created_by")!.prop] = user.username;
  if (t.columns.has("updated_by")) props[t.columns.get("updated_by")!.prop] = user.username;
  return db().transaction(async (tx) => {
    const [row] = await tx.insert(t.table).values(props as never).returning({ id: t.columns.get("id")!.col });
    const id = Number((row as { id: number }).id);
    await logAudit({ table: def.table, recordId: id, action: "create", username: user.username, details: values }, tx);
    return id;
  });
}

/**
 * Optimistic concurrency: `version` is the updated_at the editor loaded. If someone saved in the
 * meantime the update matches 0 rows and the caller is told, instead of silently overwriting.
 */
export async function updateRecord(def: RegisterDef, user: SessionUser, id: number, values: Values, version?: string): Promise<"ok" | "conflict"> {
  assertAllowed(def, user);
  const t = resolveTable(def.table);
  const props = toProps(def, values);
  if (t.columns.has("updated_by")) props[t.columns.get("updated_by")!.prop] = user.username;
  const idCol = t.columns.get("id")!.col;
  const verCol = t.columns.get("updated_at")?.col;
  const guards: SQL[] = [eq(idCol, id)];
  if (verCol && version !== undefined) {
    if (version === "") guards.push(isNull(verCol));
    else if (isValidVersion(version)) guards.push(sql`${verCol} = ${version}::timestamptz`);
    else return "conflict";
  }
  return db().transaction(async (tx) => {
    const rows = await tx.update(t.table).set(props as never).where(and(...guards)).returning({ id: idCol });
    if (rows.length === 0) return "conflict" as const;
    await logAudit({ table: def.table, recordId: id, action: "update", username: user.username, details: values }, tx);
    return "ok" as const;
  });
}

export async function setArchived(def: RegisterDef, user: SessionUser, id: number, archived: boolean): Promise<void> {
  assertAllowed(def, user);
  const t = resolveTable(def.table);
  await db().transaction(async (tx) => {
    await tx.update(t.table).set({ [t.columns.get("is_archived")!.prop]: archived ? 1 : 0 } as never).where(eq(t.columns.get("id")!.col, id));
    await logAudit({ table: def.table, recordId: id, action: archived ? "archive" : "restore", username: user.username }, tx);
  });
}

export async function deleteRecord(def: RegisterDef, user: SessionUser, id: number): Promise<void> {
  assertAllowed(def, user);
  if (!def.allowDelete || !def.deleteRoles?.includes(user.role)) throw new ForbiddenError();
  const existing = await getRecord(def, user, id);
  if (!existing) return;
  const t = resolveTable(def.table);
  // Audit row (with the full deleted record) and the delete commit atomically.
  await db().transaction(async (tx) => {
    await logAudit({ table: def.table, recordId: id, action: "delete", username: user.username, details: existing }, tx);
    await tx.delete(t.table).where(eq(t.columns.get("id")!.col, id));
  });
}

/** Options for <select> lookups (outstation, household, ...). Small tables only; archived rows excluded. */
export async function lookupOptions(kind: keyof typeof LOOKUP_TABLES): Promise<{ id: number; label: string }[]> {
  const spec = LOOKUP_TABLES[kind];
  const t = resolveTable(spec.table);
  const cols = spec.labelColumns.map((c) => t.columns.get(c)!.col);
  const arch = t.columns.get("is_archived")?.col;
  const rows = await db().select({ id: t.columns.get("id")!.col, a: cols[0]!, b: cols[1] ?? cols[0]! }).from(t.table)
    .where(arch ? eq(arch, 0) : undefined).orderBy(asc(cols[0]!)).limit(500);
  return rows.map((r) => ({ id: Number(r.id), label: spec.labelColumns.length > 1 ? `${r.a ?? ""} ${r.b ?? ""}`.trim() : String(r.a ?? "") }));
}

export async function referencedRecordNo(tableName: string, id: unknown): Promise<string> {
  if (!id) return "";
  const t = resolveTable(tableName);
  const [row] = await db().select({ n: t.columns.get("record_no")!.col }).from(t.table).where(eq(t.columns.get("id")!.col, Number(id))).limit(1);
  return row?.n ? String(row.n) : "";
}

export async function exportRows(def: RegisterDef, user: SessionUser, query: ListQuery): Promise<RecordRow[]> {
  assertAllowed(def, user);
  if (!roleCan(user.role, "export")) throw new ForbiddenError();
  const t = resolveTable(def.table);
  const rows = await db().select().from(t.table).where(buildWhere(def, { ...query, page: 1 })).orderBy(...buildOrder(def)).limit(EXPORT_ROW_CAP);
  await logAccess({ username: user.username, role: user.role, action: "export", resource: def.key, detail: `${rows.length} rows` });
  return rows.map((r) => toRecord(def, r as Record<string, unknown>));
}

/** Cheap duplicate heuristic for brand-new records: same normalised name already on file. */
export async function findPossibleDuplicates(def: RegisterDef, values: Values): Promise<{ id: number; name: string }[]> {
  if (def.duplicateCheck === false) return [];
  const t = resolveTable(def.table);
  const nameOf = (v: Values) =>
    def.key === "baptism" ? `${v.given_name ?? ""} ${v.surname ?? ""}` : String(v.full_name ?? v.name ?? "");
  const wanted = normaliseName(nameOf(values));
  if (wanted.length < 4) return [];
  const nameCols = def.key === "baptism" ? ["given_name", "surname"] : [def.fields.find((f) => f.key === "full_name") ? "full_name" : def.searchField];
  const first = t.columns.get(nameCols[0]!)?.col;
  const arch = t.columns.get("is_archived")?.col;
  if (!first) return [];
  const token = wanted.split(" ")[0]!;
  const candidates = await db().select().from(t.table)
    .where(and(arch ? eq(arch, 0) : undefined, ilike(first, `%${escapeLike(token)}%`))).limit(200);
  return candidates
    .map((r) => toRecord(def, r as Record<string, unknown>))
    .filter((r) => normaliseName(nameCols.map((c) => String(r[c] ?? "")).join(" ")) === wanted)
    .slice(0, 5)
    .map((r) => ({ id: r.id, name: nameCols.map((c) => String(r[c] ?? "")).join(" ").trim() }));
}

export function normaliseName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").sort().join(" ");
}
