import "server-only";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAccess, logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { addBaptismMarginalNote } from "@/lib/registers/marginal-notes";
import { ORDERS_BLOCKS_MARRIAGE, activeOrdinationForBaptism } from "@/lib/registers/cross-checks";
import { isValidVersion } from "@/lib/registers/concurrency";
import { PAGE_SIZE, ForbiddenError } from "@/lib/registers/repository";
import { resolveTable } from "@/lib/registers/registry";
import type { RecordRow } from "@/lib/registers/types";
import type { Values } from "@/lib/registers/validation";
import { syncMarriageSafe, type SyncStats } from "@/lib/parishioners/sync";
import { SPOUSE_ROLES, type SpouseRole } from "./fields";

const m = schema.matrimonyRecords;
const sp = schema.spouses;

function assertAllowed(user: SessionUser) {
  if (!roleCan(user.role, "registers")) throw new ForbiddenError();
}

/** Thrown for problems the secretary can fix on the form; carries the field to highlight. */
export class MarriageRuleError extends Error {
  constructor(message: string, public field?: string) { super(message); }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
// Fully qualified on purpose: Drizzle renders a column interpolated into a select-list/sub-query as a bare "id",
// which would silently bind to the spouses table inside the sub-query instead of the marriage.
const MARRIAGE_ID = sql.raw('"matrimony_records"."id"');
const spouseName = (role: SpouseRole) =>
  sql<string | null>`(select trim(s.given_name || ' ' || s.surname) from spouses s where s.matrimony_id = ${MARRIAGE_ID} and s.role = ${role} limit 1)`;

export interface MarriageQuery { q?: string; type?: string; from?: string; to?: string; archived?: boolean; page?: number }

function where(query: MarriageQuery): SQL | undefined {
  const c: SQL[] = [eq(m.isArchived, query.archived ? 1 : 0)];
  const q = query.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    c.push(or(
      ilike(m.recordNo, like),
      sql`exists (select 1 from spouses s where s.matrimony_id = ${MARRIAGE_ID} and (s.given_name || ' ' || s.surname) ilike ${like})`,
    )!);
  }
  if (query.type && ["catholic", "mixed_religion", "disparity_of_cult", "other"].includes(query.type)) c.push(eq(m.marriageType, query.type));
  if (query.from) c.push(gte(m.dateOfMarriage, query.from));
  if (query.to) c.push(lte(m.dateOfMarriage, query.to));
  return and(...c);
}

export interface MarriageRow { id: number; recordNo: string | null; groom: string | null; bride: string | null; date: string | null; minister: string | null }

export async function listMarriages(user: SessionUser, query: MarriageQuery) {
  assertAllowed(user);
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const w = where(query);
  const [{ total } = { total: 0 }] = await db().select({ total: sql<number>`count(*)` }).from(m).where(w);
  const rows = await db().select({
    id: m.id, recordNo: m.recordNo, groom: spouseName("groom"), bride: spouseName("bride"), date: m.dateOfMarriage, minister: m.minister,
  }).from(m).where(w).orderBy(desc(m.dateOfMarriage), desc(m.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return { rows: rows as MarriageRow[], total: Number(total), page, pageSize: PAGE_SIZE };
}

/** Maps a row (JS property names) back to snake_case keys, like the generic register repository. */
function toRecord(table: string, row: Record<string, unknown>): RecordRow {
  const out: Record<string, unknown> = {};
  for (const [dbName, { prop }] of resolveTable(table).columns) out[dbName] = row[prop];
  return out as RecordRow;
}

export async function getMarriage(user: SessionUser, id: number) {
  assertAllowed(user);
  const [row] = await db().select().from(m).where(eq(m.id, id)).limit(1);
  if (!row) return null;
  const spouseRows = await db().select().from(sp).where(eq(sp.matrimonyId, id));
  const find = (role: SpouseRole) => {
    const r = spouseRows.find((s) => s.role === role);
    return r ? toRecord("spouses", r as Record<string, unknown>) : null;
  };
  return { marriage: toRecord("matrimony_records", row as Record<string, unknown>), groom: find("groom"), bride: find("bride") };
}

/** snake_case values -> Drizzle property names, dropping anything that is not a real column. */
function toProps(table: string, values: Values): Record<string, unknown> {
  const t = resolveTable(table);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) { const c = t.columns.get(k); if (c) out[c.prop] = v; }
  return out;
}

export interface SaveInput { marriage: Values; groom: Values; bride: Values; version?: string }

/**
 * Marriage + both spouses + audit + marginal notes commit in ONE transaction: either the whole marriage
 * is recorded or nothing is. Returns "conflict" if someone else saved the record while it was being edited.
 */
export async function saveMarriage(user: SessionUser, id: number | null, input: SaveInput): Promise<{ id: number; sync: SyncStats | null } | "conflict"> {
  assertAllowed(user);
  const spouses: Record<SpouseRole, Values> = { groom: input.groom, bride: input.bride };

  const saved = await db().transaction(async (tx) => {
    // Either Holy Matrimony or Holy Orders: a spouse already ordained cannot be married in the register.
    for (const role of SPOUSE_ROLES) {
      const ref = Number(spouses[role].baptism_register_ref);
      if (Number.isInteger(ref) && ref > 0 && (await activeOrdinationForBaptism(ref))) {
        throw new MarriageRuleError(`The ${role} ${ORDERS_BLOCKS_MARRIAGE}`, `${role}_baptism_register_ref`);
      }
    }

    const marriageProps = toProps("matrimony_records", input.marriage);
    marriageProps[resolveTable("matrimony_records").columns.get("updated_by")!.prop] = user.username;
    let marriageId: number;

    if (id === null) {
      marriageProps[resolveTable("matrimony_records").columns.get("created_by")!.prop] = user.username;
      const [row] = await tx.insert(m).values(marriageProps as never).returning({ id: m.id });
      marriageId = row!.id;
    } else {
      const guards: SQL[] = [eq(m.id, id)];
      if (input.version !== undefined) {
        if (input.version === "") guards.push(sql`${m.updatedAt} is null`);
        else if (isValidVersion(input.version)) guards.push(sql`${m.updatedAt} = ${input.version}::timestamptz`);
        else return "conflict" as const;
      }
      const rows = await tx.update(m).set(marriageProps as never).where(and(...guards)).returning({ id: m.id });
      if (rows.length === 0) return "conflict" as const;
      marriageId = id;
    }

    for (const role of SPOUSE_ROLES) {
      const props = toProps("spouses", spouses[role]);
      const [existing] = await tx.select({ id: sp.id }).from(sp).where(and(eq(sp.matrimonyId, marriageId), eq(sp.role, role))).limit(1);
      if (existing) await tx.update(sp).set(props as never).where(eq(sp.id, existing.id));
      else await tx.insert(sp).values({ ...props, matrimonyId: marriageId, role } as never);
    }

    await logAudit({ table: "matrimony_records", recordId: marriageId, action: id === null ? "create" : "update", username: user.username,
      details: { marriage: input.marriage, groom: input.groom, bride: input.bride } }, tx);

    // Canon 535 §2: annotate each spouse's own baptismal entry.
    const when = input.marriage.date_of_marriage ? formatDate(String(input.marriage.date_of_marriage)) : "date unknown";
    const name = (v: Values) => `${v.given_name ?? ""} ${v.surname ?? ""}`.trim();
    for (const [role, other] of [["groom", "bride"], ["bride", "groom"]] as const) {
      const ref = Number(spouses[role].baptism_register_ref);
      if (Number.isInteger(ref) && ref > 0) {
        const partner = name(spouses[other]);
        await addBaptismMarginalNote(tx, ref, `Married${partner ? ` to ${partner}` : ""} on ${when} (Matrimony record #${marriageId}).`, user.username);
      }
    }
    return { id: marriageId };
  });
  if (saved === "conflict") return saved;
  // After the marriage is safely committed, bring the Parishioners list up to date (separate transaction, never throws).
  return { id: saved.id, sync: await syncMarriageSafe(saved.id, user.username) };
}

export async function setMarriageArchived(user: SessionUser, id: number, archived: boolean): Promise<void> {
  assertAllowed(user);
  await db().transaction(async (tx) => {
    await tx.update(m).set({ isArchived: archived ? 1 : 0, updatedBy: user.username }).where(eq(m.id, id));
    await logAudit({ table: "matrimony_records", recordId: id, action: archived ? "archive" : "restore", username: user.username }, tx);
  });
}

export const EXPORT_ROW_CAP = 20_000;

export async function exportMarriages(user: SessionUser, query: MarriageQuery) {
  assertAllowed(user);
  if (!roleCan(user.role, "export")) throw new ForbiddenError();
  const w = where(query);
  const rows = await db().select({
    id: m.id, recordNo: m.recordNo, date: m.dateOfMarriage, place: m.placeOfMarriage, type: m.marriageType, minister: m.minister,
    witnesses: m.witnesses, banns: m.bannsPublishedDates, dispensation: m.dispensation, groom: spouseName("groom"), bride: spouseName("bride"),
  }).from(m).where(w).orderBy(desc(m.dateOfMarriage), desc(m.id)).limit(EXPORT_ROW_CAP);
  await logAccess({ username: user.username, role: user.role, action: "export", resource: "matrimony", detail: `${rows.length} rows` });
  return rows;
}
