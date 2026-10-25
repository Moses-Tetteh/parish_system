import "server-only";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { looksLikeSamePerson } from "@/lib/parishioners/name-matcher";

const H = schema.households, HM = schema.householdMembers;
export type Household = typeof H.$inferSelect;
export type HouseholdMember = typeof HM.$inferSelect;
export class HouseholdForbiddenError extends Error {}
export class HouseholdInputError extends Error {}
export const RELATIONSHIPS = ["Head", "Spouse", "Child", "Sibling", "Parent", "Other"] as const;

const guard = (u: SessionUser) => { if (!roleCan(u.role, "registers")) throw new HouseholdForbiddenError(); };
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listHouseholds(u: SessionUser, q: string, archived: boolean): Promise<(Household & { members: number })[]> {
  guard(u);
  const where = and(eq(H.isArchived, archived ? 1 : 0), q.trim() ? ilike(H.householdName, `%${likeEscape(q.trim())}%`) : undefined);
  const rows = await db().select({ h: H, members: sql<number>`(select count(*) from household_members m where m.household_id = ${H.id})` }).from(H).where(where).orderBy(asc(H.householdName)).limit(1000);
  return rows.map((r) => ({ ...r.h, members: Number(r.members) }));
}

export async function getHousehold(u: SessionUser, id: number): Promise<{ household: Household; members: HouseholdMember[] } | null> {
  guard(u);
  const [household] = await db().select().from(H).where(eq(H.id, id)).limit(1);
  if (!household) return null;
  return { household, members: await db().select().from(HM).where(eq(HM.householdId, id)).orderBy(asc(HM.id)) };
}

export interface HouseholdInput { householdName: string; headOfHousehold: string | null; address: string | null; phone: string | null; notes: string | null }

export async function saveHousehold(u: SessionUser, id: number | null, i: HouseholdInput): Promise<number> {
  guard(u);
  if (!i.householdName.trim()) throw new HouseholdInputError("‘Household Name’ is required.");
  return db().transaction(async (tx) => {
    if (id === null) {
      const [r] = await tx.insert(H).values({ ...i, createdBy: u.username, updatedBy: u.username }).returning({ id: H.id });
      await logAudit({ table: "households", recordId: r!.id, action: "create", username: u.username, details: i }, tx);
      return r!.id;
    }
    const rows = await tx.update(H).set({ ...i, updatedBy: u.username }).where(eq(H.id, id)).returning({ id: H.id });
    if (!rows.length) throw new HouseholdInputError("That household no longer exists.");
    await logAudit({ table: "households", recordId: id, action: "update", username: u.username, details: i }, tx);
    return id;
  });
}

export async function setHouseholdArchived(u: SessionUser, id: number, archived: boolean): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    await tx.update(H).set({ isArchived: archived ? 1 : 0, updatedBy: u.username }).where(eq(H.id, id));
    await logAudit({ table: "households", recordId: id, action: archived ? "archive" : "restore", username: u.username }, tx);
  });
}

/** Light, NON-blocking duplicate hint (a double click, or someone already listed): the save always goes ahead. */
export async function addHouseholdMember(
  u: SessionUser, householdId: number, m: { fullName: string; relationship: string | null; linkedMemberId: number | null; notes: string | null },
): Promise<{ similarTo: string | null }> {
  guard(u);
  if (!m.fullName.trim()) throw new HouseholdInputError("‘Full Name’ is required.");
  // The dues-member link is part of the finance corner: only roles that may see Members can set it (a crafted value from a Secretary is dropped).
  const linked = m.linkedMemberId && roleCan(u.role, "financials.members") ? m.linkedMemberId : null;
  return db().transaction(async (tx) => {
    const [h] = await tx.select({ id: H.id }).from(H).where(eq(H.id, householdId)).limit(1);
    if (!h) throw new HouseholdInputError("That household no longer exists.");
    if (linked) {
      const [ok] = await tx.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.id, linked)).limit(1);
      if (!ok) throw new HouseholdInputError("Choose a valid dues member.");
    }
    const existing = await tx.select({ n: HM.fullName }).from(HM).where(eq(HM.householdId, householdId));
    const similar = existing.find((e) => looksLikeSamePerson(e.n, m.fullName))?.n ?? null;
    const [r] = await tx.insert(HM).values({ householdId, fullName: m.fullName.trim(), relationship: m.relationship, linkedMemberId: linked, notes: m.notes, createdBy: u.username }).returning({ id: HM.id });
    await logAudit({ table: "household_members", recordId: r!.id, action: "create", username: u.username, details: { householdId, name: m.fullName } }, tx);
    return { similarTo: similar };
  });
}

export async function removeHouseholdMember(u: SessionUser, householdId: number, memberRowId: number): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    const rows = await tx.delete(HM).where(and(eq(HM.id, memberRowId), eq(HM.householdId, householdId))).returning({ id: HM.id });
    if (rows.length) await logAudit({ table: "household_members", recordId: memberRowId, action: "delete", username: u.username, details: { householdId } }, tx);
  });
}
