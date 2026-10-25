import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Executor } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/app-settings";
import { formatDate } from "@/lib/dates";
import { addBaptismMarginalNote } from "@/lib/registers/marginal-notes";
import { splitName } from "@/lib/marriage-prep/rules";
import { syncRecordSafe } from "@/lib/parishioners/sync";
import { SPONSOR_PROGRAMS, attendancePercent, evaluateSponsor, promotionPlan, readiness, sponsorFactsFromCensus, type PromoteChoice, type SponsorFacts } from "./rules";

const C = schema.sacramentCandidates, S = schema.sponsors, AT = schema.candidateAttendance;
export type Candidate = typeof C.$inferSelect;
export type Sponsor = typeof S.$inferSelect;
export class CandidateError extends Error {}
export class CandidateForbiddenError extends Error {}
const need = (u: SessionUser, p: "registers" | "sponsor.override") => { if (!roleCan(u.role, p)) throw new CandidateForbiddenError(); };

export const getCandidate = async (u: SessionUser, id: number): Promise<Candidate | null> => { need(u, "registers"); return (await db().select().from(C).where(eq(C.id, id)).limit(1))[0] ?? null; };

export async function attendanceFor(candidateId: number, ex: Executor = db()): Promise<{ held: number; present: number; percent: number | null }> {
  const [r] = await ex.select({ held: sql<number>`count(*)`, present: sql<number>`coalesce(sum(${AT.present}), 0)` }).from(AT).where(eq(AT.candidateId, candidateId));
  const held = Number(r?.held ?? 0), present = Number(r?.present ?? 0);
  return { held, present, percent: attendancePercent(held, present) };
}

export const sponsorsFor = (candidateId: number, ex: Executor = db()) => ex.select().from(S).where(eq(S.candidateId, candidateId)).orderBy(asc(S.id));

export async function readinessFor(c: Candidate, ex: Executor = db()): Promise<string[]> {
  const min = Number(await getSetting("candidate_min_attendance_percent", "75")) || 75;
  const eligible = SPONSOR_PROGRAMS.includes(c.program) ? (await sponsorsFor(c.id, ex)).filter((s) => s.eligibility === "eligible").length : 0;
  return readiness(c, await attendanceFor(c.id, ex), min, eligible);
}

/** Roll-call: one row per (candidate, date); saving the same date again updates it. Only candidates in `shownIds` can be marked. */
export async function recordSession(u: SessionUser, date: string, shownIds: number[], presentIds: number[]): Promise<number> {
  need(u, "registers");
  const present = new Set(presentIds);
  await db().transaction(async (tx) => {
    for (const cid of shownIds) {
      await tx.insert(AT).values({ candidateId: cid, sessionDate: date, present: present.has(cid) ? 1 : 0, recordedBy: u.username })
        .onConflictDoUpdate({ target: [AT.candidateId, AT.sessionDate], set: { present: present.has(cid) ? 1 : 0, recordedBy: u.username } });
    }
  });
  return shownIds.length;
}

export interface SponsorInput { sponsorName: string; role: "godfather" | "godmother" | "sponsor"; age: number | null; isCatholic: boolean; isConfirmed: boolean; hasReceivedEucharist: boolean; isPractising: boolean; marriageRegular: boolean; isParent: boolean; parishionerId: number | null }

/** A sponsor picked from the census gets their facts from the census record (the ticks are used only when none is picked). */
export async function addSponsor(u: SessionUser, candidateId: number, i: SponsorInput): Promise<{ eligibility: string; issues: string[] }> {
  need(u, "registers");
  const minAge = Math.max(1, Number(await getSetting("sponsor_min_age", "16")) || 16);
  return db().transaction(async (tx) => {
    const [cand] = await tx.select({ id: C.id }).from(C).where(eq(C.id, candidateId)).limit(1);
    if (!cand) throw new CandidateError("Candidate not found.");
    let name = i.sponsorName.trim();
    let facts: SponsorFacts = { sponsorAge: i.age, isCatholic: i.isCatholic ? 1 : 0, isConfirmed: i.isConfirmed ? 1 : 0, hasReceivedEucharist: i.hasReceivedEucharist ? 1 : 0, isPractising: i.isPractising ? 1 : 0, marriageRegular: i.marriageRegular ? 1 : 0, isParentOfCandidate: i.isParent };
    if (i.parishionerId) {
      const [p] = await tx.select().from(schema.parishioners).where(eq(schema.parishioners.id, i.parishionerId)).limit(1);
      if (!p) throw new CandidateError("Pick a parishioner from the list.");
      const f = sponsorFactsFromCensus({ fullName: p.fullName, dobYear: p.dateOfBirthYear, baptisedStatus: p.baptisedStatus, confirmationStatus: p.confirmationStatus, communionStatus: p.communionStatus, practisingStatus: p.practisingStatus, maritalStatus: p.maritalStatus }, new Date().getUTCFullYear());
      name = name || f.sponsorName;
      facts = { ...f, sponsorAge: i.age ?? f.sponsorAge, isParentOfCandidate: i.isParent };
    }
    if (!name) throw new CandidateError("Enter the sponsor’s name or pick them from the census.");
    const ev = evaluateSponsor(facts, minAge);
    const [row] = await tx.insert(S).values({
      candidateId, sponsorName: name.slice(0, 250), sponsorRole: i.role, parishionerId: i.parishionerId, sponsorAge: facts.sponsorAge,
      isCatholic: facts.isCatholic ?? 1, isConfirmed: facts.isConfirmed ?? 0, hasReceivedEucharist: facts.hasReceivedEucharist ?? 0, isPractising: facts.isPractising ?? 0,
      isParentOfCandidate: i.isParent ? 1 : 0, marriageRegular: facts.marriageRegular ?? 1, eligibility: ev.eligibility, eligibilityIssues: ev.issues.join(" ") || null, createdBy: u.username,
    }).returning({ id: S.id });
    await logAudit({ table: "sponsors", recordId: row!.id, action: "create", username: u.username, details: { candidateId, eligibility: ev.eligibility } }, tx);
    return ev;
  });
}

export async function overrideSponsor(u: SessionUser, candidateId: number, sponsorId: number, reason: string): Promise<void> {
  need(u, "sponsor.override");
  if (!reason.trim()) throw new CandidateError("A reason is required to override the eligibility check.");
  await db().transaction(async (tx) => {
    const rows = await tx.update(S).set({ eligibility: "eligible", overrideBy: u.username, overrideReason: reason.trim().slice(0, 500) }).where(and(eq(S.id, sponsorId), eq(S.candidateId, candidateId))).returning({ id: S.id });
    if (!rows.length) throw new CandidateError("Sponsor not found.");
    await logAudit({ table: "sponsors", recordId: sponsorId, action: "approve", username: u.username, details: `override: ${reason.trim().slice(0, 200)}` }, tx);
  });
}

export async function deleteSponsor(u: SessionUser, candidateId: number, sponsorId: number): Promise<void> {
  need(u, "registers");
  await db().transaction(async (tx) => {
    const rows = await tx.delete(S).where(and(eq(S.id, sponsorId), eq(S.candidateId, candidateId))).returning({ id: S.id });
    if (rows.length) await logAudit({ table: "sponsors", recordId: sponsorId, action: "delete", username: u.username, details: { candidateId } }, tx);
  });
}

export async function withdrawCandidate(u: SessionUser, id: number): Promise<void> {
  need(u, "registers");
  await db().transaction(async (tx) => {
    await tx.update(C).set({ candidateStatus: "withdrawn", updatedBy: u.username }).where(and(eq(C.id, id), eq(C.candidateStatus, "active")));
    await logAudit({ table: "sacrament_candidates", recordId: id, action: "update", username: u.username, details: "withdrawn" }, tx);
  });
}

export interface PromoteInput extends PromoteChoice { date: string; minister: string | null; place: string | null; recordNo: string | null; force: boolean }

/**
 * Enters a prepared candidate in the sacramental registers from the preparation file, in ONE transaction (all entries or none).
 * Unmet requirements block it unless the priest/admin ticks "override" (sponsor.override).
 */
export async function promote(u: SessionUser, id: number, o: PromoteInput): Promise<string> {
  need(u, "registers");
  const parish = await getSetting("parish_name", "this parish");
  const created: { type: "baptism" | "communion" | "confirmation"; id: number }[] = [];
  const summary = await db().transaction(async (tx) => {
    const [c] = await tx.select().from(C).where(eq(C.id, id)).for("update");
    if (!c) throw new CandidateError("Candidate not found.");
    if (c.candidateStatus === "promoted") throw new CandidateError("This candidate has already been entered in the register.");
    const blockers = (await readinessFor(c, tx)).filter((b) => b !== "Already entered in the register.");
    if (blockers.length && !(o.force && roleCan(u.role, "sponsor.override"))) {
      throw new CandidateError(`Not ready to enter in the register — ${blockers.join(" ")}${roleCan(u.role, "sponsor.override") ? " (You can tick “Override the requirements” if you are sure.)" : " Ask the priest to review."}`);
    }
    const plan = promotionPlan(c.program, !!c.baptismId, o);
    if (!plan.baptism && !plan.confirmation && !plan.communion) throw new CandidateError("Nothing to record — tick at least one sacrament.");
    const sponsors = (await sponsorsFor(id, tx)).filter((s) => s.eligibility === "eligible").map((s) => s.sponsorName);
    const sponsorText = sponsors.length ? sponsors.join(" & ") : null;
    const place = o.place || parish, minister = o.minister;
    const parts: string[] = [];
    let baptismId = c.baptismId;
    const [given, surname] = splitName(c.fullName);
    if (plan.baptism) {
      const dob = c.dateOfBirth ? new Date(`${c.dateOfBirth}T00:00:00Z`) : null;
      const [b] = await tx.insert(schema.baptismRecords).values({
        recordNo: o.recordNo, givenName: given, surname: surname || given, fatherName: c.fatherName, motherName: c.motherName,
        dateOfBirthYear: dob?.getUTCFullYear() ?? null, dateOfBirthMonth: dob ? dob.getUTCMonth() + 1 : null, dateOfBirthDay: dob?.getUTCDate() ?? null,
        dateOfBaptism: o.date, placeOfBaptism: place, minister, patrin: sponsorText, createdBy: u.username, updatedBy: u.username,
      } as never).returning({ id: schema.baptismRecords.id });
      baptismId = b!.id; created.push({ type: "baptism", id: b!.id }); parts.push(`Baptism #${b!.id}`);
    }
    const baptismPlace = c.baptismPlace || (plan.baptism ? place : null);
    if (plan.communion) {
      const [r] = await tx.insert(schema.communionRecords).values({
        recordNo: o.recordNo, fullName: c.fullName, fatherName: c.fatherName, motherName: c.motherName, placeOfBaptism: baptismPlace, baptismRegisterRef: baptismId, minister, place, dateOfCommunion: o.date, createdBy: u.username, updatedBy: u.username,
      } as never).returning({ id: schema.communionRecords.id });
      created.push({ type: "communion", id: r!.id }); parts.push(`First Communion #${r!.id}`);
      if (baptismId) await tx.update(schema.baptismRecords).set({ communionRef: r!.id } as never).where(and(eq(schema.baptismRecords.id, baptismId), sql`communion_ref is null`));
    }
    if (plan.confirmation) {
      const [r] = await tx.insert(schema.confirmationRecords).values({
        recordNo: o.recordNo, fullName: c.fullName, confirmationName: c.confirmationName, fatherName: c.fatherName, motherName: c.motherName, sponsorName: sponsorText, baptismPlace, baptismRegisterRef: baptismId, minister, place, dateOfConfirmation: o.date, createdBy: u.username, updatedBy: u.username,
      } as never).returning({ id: schema.confirmationRecords.id });
      created.push({ type: "confirmation", id: r!.id }); parts.push(`Confirmation #${r!.id}`);
      if (baptismId) {
        await tx.update(schema.baptismRecords).set({ confirmationRef: r!.id } as never).where(and(eq(schema.baptismRecords.id, baptismId), sql`confirmation_ref is null`));
        await addBaptismMarginalNote(tx, baptismId, `Confirmed on ${formatDate(o.date)} (Confirmation record #${r!.id}).`, u.username);
      }
    }
    const text = parts.join(", ");
    await tx.update(C).set({ candidateStatus: "promoted", stage: "completed", promotedOn: o.date, promotedSummary: text, baptismId: sql`coalesce(${C.baptismId}, ${baptismId})` as never, updatedBy: u.username }).where(eq(C.id, id));
    await logAudit({ table: "sacrament_candidates", recordId: id, action: "issue", username: u.username, details: text }, tx);
    return text;
  });
  for (const r of created) await syncRecordSafe(r.type, r.id, u.username); // the Parishioners list follows, after the entries are safely committed
  return summary;
}

export async function activeCandidatesFor(u: SessionUser, program: string, classGroup: string) {
  need(u, "registers");
  return db().select({ id: C.id, fullName: C.fullName, program: C.program, classGroup: C.classGroup }).from(C)
    .where(and(eq(C.isArchived, 0), eq(C.candidateStatus, "active"), program ? eq(C.program, program) : undefined, classGroup ? eq(C.classGroup, classGroup) : undefined)).orderBy(asc(C.fullName));
}
export async function classGroups(): Promise<string[]> {
  const rows = await db().selectDistinct({ g: C.classGroup }).from(C).where(sql`${C.classGroup} is not null and ${C.classGroup} <> ''`).orderBy(asc(C.classGroup));
  return rows.map((r) => r.g!).filter(Boolean);
}
export async function attendanceOn(date: string, ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await db().select({ c: AT.candidateId, p: AT.present }).from(AT).where(and(eq(AT.sessionDate, date), inArray(AT.candidateId, ids)));
  return new Map(rows.map((r) => [r.c, r.p]));
}
