import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAccess, logAudit } from "@/lib/audit";
import { roleCan, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { resolveTable } from "@/lib/registers/registry";
import { combine, findPairs, blocker, chooseKeeper, type Pair, type Row } from "./merger";
import { nameKey } from "./name-matcher";

const P = schema.parishioners;
export class ToolForbiddenError extends Error {}
export class ToolInputError extends Error {}
const need = (u: SessionUser, p: Permission) => { if (!roleCan(u.role, p)) throw new ToolForbiddenError(); };

/** Drizzle camelCase row <-> snake_case column object (the shape the pure merger works on). */
function toSnake(row: Record<string, unknown>): Row {
  const t = resolveTable("parishioners"), out: Row = {};
  for (const [name, c] of t.columns) out[name] = row[c.prop];
  return out;
}
function toProps(patch: Row): Record<string, unknown> {
  const t = resolveTable("parishioners"), out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) { const c = t.columns.get(k); if (c) out[c.prop] = v; }
  if (typeof patch.full_name === "string") { const c = t.columns.get("name_key"); if (c) out[c.prop] = nameKey(patch.full_name) || null; }
  return out;
}

async function dismissedKeys(): Promise<Set<string>> {
  const rows = await db().select().from(schema.parishionerNotDuplicates);
  return new Set(rows.map((r) => `${r.lowId}-${r.highId}`));
}

export async function listDuplicatePairs(user: SessionUser, limit = 1000): Promise<Pair[]> {
  need(user, "registers");
  const rows = (await db().select().from(P).where(eq(P.isArchived, 0))).map((r) => toSnake(r as never));
  return findPairs(rows, await dismissedKeys(), limit);
}

export async function mergeParishioners(user: SessionUser, idA: number, idB: number, keepId: number | null): Promise<{ kept: number; absorbed: number; name: string }> {
  need(user, "registers");
  if (idA === idB) throw new ToolInputError("Choose two different people.");
  return db().transaction(async (tx) => {
    // Lock both rows so two staff members cannot merge the same pair (or overlapping pairs) at once.
    const rows = await tx.select().from(P).where(inArray(P.id, [idA, idB])).for("update");
    const a = rows.find((r) => r.id === idA), b = rows.find((r) => r.id === idB);
    if (!a || !b || a.isArchived === 1 || b.isArchived === 1) throw new ToolInputError("One of these records is no longer active — reload the page.");
    const ra = toSnake(a as never), rb = toSnake(b as never);
    const why = blocker(ra, rb);
    if (why) throw new ToolInputError(why);
    let [keep, drop] = chooseKeeper(ra, rb);
    if (keepId !== null && [idA, idB].includes(keepId) && Number(keep.id) !== keepId) [keep, drop] = [drop, keep];
    const change = combine(keep, drop, new Date().toISOString().slice(0, 10));
    // Release the absorbed row's register links FIRST: each link column is unique, and the survivor may inherit it.
    await tx.update(P).set({ ...toProps(change.drop), updatedBy: user.username } as never).where(eq(P.id, Number(drop.id)));
    for (const t of [schema.societyMembers, schema.sponsors, schema.ministryAssignments]) {
      await tx.update(t).set({ parishionerId: Number(keep.id) } as never).where(eq(t.parishionerId, Number(drop.id)));
    }
    await tx.update(P).set({ ...toProps(change.keep), updatedBy: user.username } as never).where(eq(P.id, Number(keep.id)));
    await logAudit({ table: "parishioners", recordId: Number(keep.id), action: "update", username: user.username, details: `merge: absorbed duplicate #${drop.id} (${drop.full_name})` }, tx);
    return { kept: Number(keep.id), absorbed: Number(drop.id), name: String(change.keep.full_name ?? keep.full_name) };
  });
}

/** Merges every pair the matcher is certain about (same parents, no conflicts), one transaction each; a failing pair is skipped and reported. */
export async function mergeAllCertain(user: SessionUser, max = 500) {
  need(user, "registers");
  const skip = new Set<string>(), errors: string[] = [], details: { kept: number; absorbed: number; name: string }[] = [];
  for (let i = 0; i < max; i++) {
    const next = (await listDuplicatePairs(user, 5000)).find((p) => p.auto && !skip.has(`${p.a.id}-${p.b.id}`));
    if (!next) break;
    try { details.push(await mergeParishioners(user, Number(next.a.id), Number(next.b.id), null)); }
    catch (e) { skip.add(`${next.a.id}-${next.b.id}`); errors.push(`${next.a.full_name}: ${e instanceof ToolInputError ? e.message : "could not be merged"}`); }
  }
  return { merged: details.length, errors, left: (await listDuplicatePairs(user, 5000)).filter((p) => p.auto).length };
}

export async function dismissPair(user: SessionUser, idA: number, idB: number): Promise<void> {
  need(user, "registers");
  const [low, high] = idA < idB ? [idA, idB] : [idB, idA];
  await db().transaction(async (tx) => {
    await tx.insert(schema.parishionerNotDuplicates).values({ lowId: low, highId: high, decidedBy: user.username }).onConflictDoNothing();
    await logAudit({ table: "parishioners", recordId: low, action: "update", username: user.username, details: `not_duplicate: #${low} and #${high} are different people` }, tx);
  });
}

/** Confidential pastoral list: every view is access-logged. */
export async function irregularUnions(user: SessionUser) {
  need(user, "sensitive.irregular");
  const rows = await db().select({ p: P, outstation: schema.outstations.name }).from(P).leftJoin(schema.outstations, eq(schema.outstations.id, P.outstationId))
    .where(and(eq(P.isArchived, 0), eq(P.residencyStatus, "resident"), inArray(P.maritalStatus, ["married_customary", "civil_only", "divorced_remarried"])))
    .orderBy(asc(P.maritalStatus), asc(P.fullName));
  await logAccess({ username: user.username, role: user.role, action: "view", resource: "irregular_unions", detail: `${rows.length} rows` });
  return rows;
}

export async function householdImportCandidates(user: SessionUser) {
  need(user, "registers");
  const H = schema.households, HM = schema.householdMembers;
  return db().select({ id: HM.id, fullName: HM.fullName, relationship: HM.relationship, householdId: H.id, householdName: H.householdName, phone: H.phone, address: H.address })
    .from(HM).innerJoin(H, eq(H.id, HM.householdId))
    .where(and(eq(H.isArchived, 0), sql`not exists (select 1 from parishioners p where p.household_id = ${H.id} and p.full_name = ${HM.fullName})`))
    .orderBy(asc(H.householdName), asc(HM.fullName)).limit(2000);
}

/** Only rows of the freshly computed candidate list can be imported (a crafted id outside it is ignored). */
export async function importHouseholdMembers(user: SessionUser, chosen: number[]): Promise<number> {
  need(user, "registers");
  const pick = new Set(chosen);
  const candidates = (await householdImportCandidates(user)).filter((c) => pick.has(c.id));
  await db().transaction(async (tx) => {
    for (const c of candidates) {
      const [r] = await tx.insert(P).values({
        fullName: c.fullName, nameKey: nameKey(c.fullName) || null, householdId: c.householdId, phone: c.phone, residence: c.address || null,
        notes: c.relationship ? `Household role: ${c.relationship}` : null, createdBy: user.username, updatedBy: user.username,
      } as never).returning({ id: P.id });
      await logAudit({ table: "parishioners", recordId: r!.id, action: "create", username: user.username, details: { from_household: c.householdId } }, tx);
    }
  });
  return candidates.length;
}
