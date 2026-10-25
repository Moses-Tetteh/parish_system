import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { addBaptismMarginalNote } from "@/lib/registers/marginal-notes";
import { formatDate } from "@/lib/dates";

export class NotificationError extends Error {}
export class NotificationForbiddenError extends Error {}
const guard = (u: SessionUser) => { if (!roleCan(u.role, "notifications")) throw new NotificationForbiddenError(); };

export interface Pending { source_type: string; source_id: number; party: string; person: string; event: string; event_date: string | null; event_place: string | null; minister: string | null; baptism_place: string; baptism_date: string | null; father_name: string | null; mother_name: string | null; partner: string | null }
export const keyOf = (r: Pick<Pending, "source_type" | "source_id" | "party">) => `${r.source_type}|${r.source_id}|${r.party}`;

/**
 * Canon 535 §2: a confirmation / first communion / marriage / ordination for someone baptised ELSEWHERE (no baptism entry
 * here, but a baptism place recorded) must be reported to that parish. This is every such event not yet reported.
 */
export async function pending(u: SessionUser): Promise<Pending[]> {
  guard(u);
  const rows = await db().execute(sql`
    select x.* from (
      select 'confirmation' source_type, c.id source_id, '' party, c.full_name person, 'Confirmation' event, c.date_of_confirmation::text event_date, c.place event_place, c.minister, c.baptism_place,
             null::text baptism_date, c.father_name, c.mother_name, null::text partner, c.notification_sent done
        from confirmation_records c where c.is_archived = 0 and c.baptism_register_ref is null and coalesce(c.baptism_place, '') <> ''
      union all
      select 'communion', k.id, '', k.full_name, 'First Holy Communion', k.date_of_communion::text, k.place, k.minister, k.place_of_baptism, null, k.father_name, k.mother_name, null, k.notification_sent
        from communion_records k where k.is_archived = 0 and k.baptism_register_ref is null and coalesce(k.place_of_baptism, '') <> ''
      union all
      select 'matrimony', m.id, s.role, concat(s.given_name, ' ', s.surname), 'Marriage', m.date_of_marriage::text, m.place_of_marriage, m.minister, s.baptism_place, s.baptism_date::text, s.father_name, s.mother_name,
             (select concat(o.given_name, ' ', o.surname) from spouses o where o.matrimony_id = m.id and o.role <> s.role limit 1), 0::smallint
        from spouses s join matrimony_records m on m.id = s.matrimony_id where m.is_archived = 0 and s.baptism_register_ref is null and coalesce(s.baptism_place, '') <> ''
      union all
      select 'holy_orders', h.id, '', h.full_name, concat('Ordination', case when coalesce(h.order_type, '') = '' then '' else concat(' (', h.order_type, ')') end), h.ordination_date::text, null, null, h.place_baptized, null, h.father_name, h.mother_name, null, 0::smallint
        from holy_orders h where h.is_archived = 0 and h.baptism_register_ref is null and coalesce(h.place_baptized, '') <> ''
    ) x
    left join baptism_notifications n on n.source_type = x.source_type and n.source_id = x.source_id and n.party = x.party
    where n.id is null and x.done = 0 order by x.baptism_place, x.event_date, x.person`) as unknown as Pending[];
  return rows.map((r) => ({ ...r, source_id: Number(r.source_id) }));
}

export async function pendingByParish(u: SessionUser): Promise<Map<string, Pending[]>> {
  const m = new Map<string, Pending[]>();
  for (const r of await pending(u)) { const k = r.baptism_place.trim(); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
}

/** Only events that are REALLY still pending can be marked (a crafted key for anything else is ignored). */
export async function markSent(u: SessionUser, keys: string[], sentOn: string, method: string, reference: string): Promise<number> {
  guard(u);
  const byKey = new Map((await pending(u)).map((r) => [keyOf(r), r]));
  let count = 0;
  await db().transaction(async (tx) => {
    for (const key of new Set(keys)) {
      const r = byKey.get(key);
      if (!r) continue;
      await tx.insert(schema.baptismNotifications).values({ sourceType: r.source_type, sourceId: r.source_id, party: r.party, sentOn, sentBy: u.username, method: method.slice(0, 60) || null, referenceNo: reference.slice(0, 100) || null, notes: `${r.person} — ${r.event} — ${r.baptism_place}`.slice(0, 500) }).onConflictDoNothing();
      if (r.source_type === "confirmation") await tx.update(schema.confirmationRecords).set({ notificationSent: 1 } as never).where(eq(schema.confirmationRecords.id, r.source_id));
      if (r.source_type === "communion") await tx.update(schema.communionRecords).set({ notificationSent: 1 } as never).where(eq(schema.communionRecords.id, r.source_id));
      await logAudit({ table: "baptism_notifications", recordId: r.source_id, action: "issue", username: u.username, details: `${r.source_type} → ${r.baptism_place}` }, tx);
      count++;
    }
  });
  return count;
}

export const sentHistory = async (u: SessionUser, limit = 50) => { guard(u); return db().select().from(schema.baptismNotifications).orderBy(desc(schema.baptismNotifications.sentOn), desc(schema.baptismNotifications.id)).limit(limit); };
export const incomingHistory = async (u: SessionUser, limit = 50) => {
  guard(u);
  const E = schema.externalSacramentNotices, B = schema.baptismRecords;
  return db().select({ e: E, given: B.givenName, surname: B.surname }).from(E).innerJoin(B, eq(B.id, E.baptismId)).orderBy(desc(E.receivedOn), desc(E.id)).limit(limit);
};

const EVENT_TEXT: Record<string, string> = { confirmation: "Confirmed", matrimony: "Married", holy_orders: "Ordained", religious_profession: "Made religious profession", other: "Noted" };
export const EVENT_TYPES: Record<string, string> = { confirmation: "Confirmation", matrimony: "Marriage", holy_orders: "Ordination", religious_profession: "Religious profession", other: "Other" };

/** A notice received FROM another parish about someone baptised HERE: stored, and written onto the baptismal entry as a marginal note. */
export async function recordIncoming(u: SessionUser, baptismId: number, i: { type: string; date: string | null; place: string | null; parish: string | null; ref: string | null; received: string; notes: string | null }): Promise<void> {
  guard(u);
  if (!(i.type in EVENT_TEXT)) throw new NotificationError("Choose the type of event.");
  await db().transaction(async (tx) => {
    const [b] = await tx.select({ id: schema.baptismRecords.id }).from(schema.baptismRecords).where(eq(schema.baptismRecords.id, baptismId)).limit(1);
    if (!b) throw new NotificationError("Pick the baptism entry from the search list.");
    const [row] = await tx.insert(schema.externalSacramentNotices).values({ baptismId, eventType: i.type, eventDate: i.date, eventPlace: i.place?.slice(0, 250) ?? null, notifyingParish: i.parish?.slice(0, 250) ?? null, letterRef: i.ref?.slice(0, 100) ?? null, receivedOn: i.received, recordedBy: u.username, notes: i.notes?.slice(0, 500) ?? null } as never).returning({ id: schema.externalSacramentNotices.id });
    const note = `${EVENT_TEXT[i.type]}${i.date ? ` on ${formatDate(i.date)}` : ""}${i.place ? ` at ${i.place}` : ""}${i.parish ? ` (notified by ${i.parish}${i.ref ? `, ref. ${i.ref}` : ""})` : i.ref ? ` (ref. ${i.ref})` : ""}${i.notes ? `. ${i.notes}` : "."}`;
    await addBaptismMarginalNote(tx, baptismId, note, u.username);
    await logAudit({ table: "external_sacrament_notices", recordId: row!.id, action: "create", username: u.username, details: { baptismId, type: i.type } }, tx);
  });
}
