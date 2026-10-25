import "server-only";
import { and, asc, between, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { addDays } from "@/lib/liturgy/calendar";

const A = schema.ministryAssignments;
export class RosterError extends Error {}
export class RosterForbiddenError extends Error {}
const guard = (u: SessionUser) => { if (!roleCan(u.role, "registers")) throw new RosterForbiddenError(); };

export const MINISTRIES = {
  lector: "Lector (Readings)", eucharistic_minister: "Extraordinary Minister of Holy Communion", usher: "Usher", collector: "Collector",
  server: "Altar Server", choir: "Choir", sacristan: "Sacristan", commentator: "Commentator", other: "Other",
} as const;

const slotKey = (time: string, outstationId: number | null) => `${time.slice(0, 5)}|${outstationId ?? 0}`;

export async function weekRoster(u: SessionUser, start: string) {
  guard(u);
  const end = addDays(start, 6);
  const [rows, times, outstations] = await Promise.all([
    db().select({ a: A, outstation: schema.outstations.name }).from(A).leftJoin(schema.outstations, eq(schema.outstations.id, A.outstationId)).where(between(A.massDate, start, end)).orderBy(asc(A.massDate), asc(A.massTime), asc(A.ministry), asc(A.id)),
    db().select({ t: schema.massTimes, outstation: schema.outstations.name }).from(schema.massTimes).leftJoin(schema.outstations, eq(schema.outstations.id, schema.massTimes.outstationId))
      .where(and(eq(schema.massTimes.isActive, 1), eq(schema.massTimes.isArchived, 0))).orderBy(asc(schema.massTimes.dayOfWeek), asc(schema.massTimes.massTime)),
    db().select({ id: schema.outstations.id, name: schema.outstations.name }).from(schema.outstations).where(eq(schema.outstations.isArchived, 0)),
  ]);
  const names = new Map(outstations.map((o) => [o.id, o.name]));
  type Slot = { time: string; oid: number | null; outstation: string | null };
  const slotsByDow = new Map<number, Map<string, Slot>>();
  for (const { t, outstation } of times) {
    const m = slotsByDow.get(t.dayOfWeek) ?? slotsByDow.set(t.dayOfWeek, new Map()).get(t.dayOfWeek)!;
    m.set(slotKey(t.massTime, t.outstationId), { time: t.massTime.slice(0, 5), oid: t.outstationId, outstation });
  }
  const assigned = new Map<string, Map<string, (typeof rows)[number]["a"][]>>();   // date -> slot -> assignments
  const extraSlots = new Map<string, Map<string, Slot>>();                        // assignments on a time that is no longer a regular Mass time
  for (const { a, outstation } of rows) {
    const k = slotKey(a.massTime, a.outstationId);
    const d = assigned.get(a.massDate) ?? assigned.set(a.massDate, new Map()).get(a.massDate)!;
    (d.get(k) ?? d.set(k, []).get(k)!).push(a);
    const x = extraSlots.get(a.massDate) ?? extraSlots.set(a.massDate, new Map()).get(a.massDate)!;
    x.set(k, { time: a.massTime.slice(0, 5), oid: a.outstationId, outstation: outstation ?? (a.outstationId ? names.get(a.outstationId) ?? null : null) });
  }
  return { slotsByDow, assigned, extraSlots, hasTimes: times.length > 0 };
}

export async function assign(u: SessionUser, i: { date: string; time: string; outstationId: number | null; ministry: string; name: string; parishionerId: number | null }): Promise<void> {
  guard(u);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)) throw new RosterError("Invalid Mass date or time.");
  if (!(i.ministry in MINISTRIES)) throw new RosterError("Choose a ministry.");
  const name = i.name.trim();
  if (!name) throw new RosterError("Enter a name.");
  await db().transaction(async (tx) => {
    const dup = await tx.select({ id: A.id }).from(A).where(and(eq(A.massDate, i.date), eq(A.massTime, `${i.time}:00`), i.outstationId === null ? sql`${A.outstationId} is null` : eq(A.outstationId, i.outstationId), eq(A.ministry, i.ministry), eq(A.personName, name))).limit(1);
    if (dup.length) throw new RosterError(`${name} is already assigned to that ministry at this Mass.`);
    const [row] = await tx.insert(A).values({ massDate: i.date, massTime: `${i.time}:00`, outstationId: i.outstationId, ministry: i.ministry, personName: name.slice(0, 250), parishionerId: i.parishionerId, createdBy: u.username }).returning({ id: A.id });
    await logAudit({ table: "ministry_assignments", recordId: row!.id, action: "create", username: u.username, details: { ...i, name } }, tx);
  });
}

export async function unassign(u: SessionUser, id: number): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    const rows = await tx.delete(A).where(eq(A.id, id)).returning({ id: A.id });
    if (rows.length) await logAudit({ table: "ministry_assignments", recordId: id, action: "delete", username: u.username }, tx);
  });
}

/** Copies the PREVIOUS week's assignments into the week starting `weekStart` (+7 days each), skipping anything already there. */
export async function copyLastWeek(u: SessionUser, weekStart: string): Promise<number> {
  guard(u);
  const prevStart = addDays(weekStart, -7), prevEnd = addDays(weekStart, -1);
  return db().transaction(async (tx) => {
    const res = await tx.execute(sql`
      insert into ministry_assignments (mass_date, mass_time, outstation_id, ministry, person_name, parishioner_id, notes, created_by)
      select m.mass_date + 7, m.mass_time, m.outstation_id, m.ministry, m.person_name, m.parishioner_id, m.notes, ${u.username}
      from ministry_assignments m where m.mass_date between ${prevStart}::date and ${prevEnd}::date
        and not exists (select 1 from ministry_assignments x where x.mass_date = m.mass_date + 7 and x.mass_time = m.mass_time
          and x.outstation_id is not distinct from m.outstation_id and x.ministry = m.ministry and x.person_name = m.person_name)
      returning id`);
    const n = (res as unknown as unknown[]).length;
    await logAudit({ table: "ministry_assignments", recordId: 0, action: "create", username: u.username, details: `copied ${n} from week of ${prevStart}` }, tx);
    return n;
  });
}
