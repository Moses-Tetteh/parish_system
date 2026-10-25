import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { OFFICES, isValidPeriod } from "./rules";

const S = schema.societies, M = schema.societyMembers, MT = schema.societyMeetings, D = schema.societyDues;
export class SocietyError extends Error {}
export class SocietyForbiddenError extends Error {}
const guard = (u: SessionUser) => { if (!roleCan(u.role, "registers")) throw new SocietyForbiddenError(); };

export async function getSociety(u: SessionUser, id: number) {
  guard(u);
  const [r] = await db().select({ s: S, outstation: schema.outstations.name }).from(S).leftJoin(schema.outstations, eq(schema.outstations.id, S.outstationId)).where(eq(S.id, id)).limit(1);
  return r ?? null;
}

export async function societyOverview(u: SessionUser, id: number, period: string) {
  guard(u);
  const [members, paid, meetings] = await Promise.all([
    db().select().from(M).where(and(eq(M.societyId, id), isNull(M.leftOn))).orderBy(sql`(${M.office} = 'Member')`, asc(M.office), asc(M.fullName)),
    db().select({ m: D.memberId, total: sql<string>`sum(${D.amountPaid})` }).from(D).where(and(eq(D.societyId, id), eq(D.periodLabel, period))).groupBy(D.memberId),
    db().select().from(MT).where(eq(MT.societyId, id)).orderBy(desc(MT.meetingDate)).limit(12),
  ]);
  return { members, paidBy: new Map(paid.map((p) => [p.m, Number(p.total)])), meetings };
}

export async function addMember(u: SessionUser, societyId: number, i: { parishionerId: number | null; fullName: string; office: string; phone: string | null }): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    let name = i.fullName.trim(), phone = i.phone;
    if (i.parishionerId) {
      const [p] = await tx.select({ n: schema.parishioners.fullName, ph: schema.parishioners.phone }).from(schema.parishioners).where(eq(schema.parishioners.id, i.parishionerId)).limit(1);
      if (!p) throw new SocietyError("Pick a parishioner from the list.");
      name ||= p.n; phone ||= p.ph;
    }
    if (!name) throw new SocietyError("Enter the member’s name or pick them from the parish list.");
    const office = (OFFICES as readonly string[]).includes(i.office) ? i.office : "Member";
    const [row] = await tx.insert(M).values({ societyId, parishionerId: i.parishionerId, fullName: name.slice(0, 250), office, phone: phone?.slice(0, 60) || null, joinedOn: new Date().toISOString().slice(0, 10), createdBy: u.username }).returning({ id: M.id });
    await logAudit({ table: "society_members", recordId: row!.id, action: "create", username: u.username, details: { societyId, name } }, tx);
  });
}

/** Members are never deleted: leaving stamps left_on so their dues history is kept. */
export async function removeMember(u: SessionUser, societyId: number, memberId: number): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    const rows = await tx.update(M).set({ leftOn: new Date().toISOString().slice(0, 10) }).where(and(eq(M.id, memberId), eq(M.societyId, societyId))).returning({ id: M.id });
    if (rows.length) await logAudit({ table: "society_members", recordId: memberId, action: "archive", username: u.username, details: { societyId } }, tx);
  });
}

export async function addMeeting(u: SessionUser, societyId: number, i: { date: string; venue: string | null; attendance: number | null; summary: string | null }): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    const [row] = await tx.insert(MT).values({ societyId, meetingDate: i.date, venue: i.venue?.slice(0, 200) ?? null, attendance: i.attendance !== null ? Math.max(0, i.attendance) : null, summary: i.summary, createdBy: u.username }).returning({ id: MT.id });
    await logAudit({ table: "society_meetings", recordId: row!.id, action: "create", username: u.username, details: { societyId } }, tx);
  });
}

export async function recordDues(u: SessionUser, societyId: number, memberId: number, period: string, amount: number): Promise<void> {
  guard(u);
  if (!(amount > 0) || !isValidPeriod(period)) throw new SocietyError("Enter a valid amount and period.");
  await db().transaction(async (tx) => {
    const [m] = await tx.select({ id: M.id }).from(M).where(and(eq(M.id, memberId), eq(M.societyId, societyId))).limit(1);
    if (!m) throw new SocietyError("Member not found in this group.");
    const [row] = await tx.insert(D).values({ societyId, memberId, periodLabel: period, amountPaid: amount.toFixed(2), paidOn: new Date().toISOString().slice(0, 10), receivedBy: u.username }).returning({ id: D.id });
    await logAudit({ table: "society_dues", recordId: row!.id, action: "create", username: u.username, details: { societyId, memberId, period, amount } }, tx);
  });
}
