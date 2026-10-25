import "server-only";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema, type Executor } from "@/db";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/app-settings";
import { resolveTable } from "@/lib/registers/registry";
import { birthYearsCompatible, looksLikeSamePerson, nameKey, parentsCompatible, tokens } from "./name-matcher";

/**
 * Keeps the Parishioners list in step with the sacrament registers (port of ParishionerSyncService.php,
 * so far wired to Holy Matrimony; `Facts` is register-neutral, so the other registers plug in the same way).
 *
 * Everyone who appears in a register is on the list; nobody is listed twice because a register entry is
 * "claimed" by exactly one parishioner via a link column. One person in several registers = ONE row.
 *
 * Rules (the safety of the data matters more than cleverness):
 *  1. Idempotent: running twice changes nothing the second time.
 *  2. Fills blanks, never overwrites what staff typed. The one exception is a sacrament's STATUS, which becomes
 *     "received" when a register entry is first linked: the register is the evidence.
 *  3. Conservative matching: link to an existing parishioner only when exactly one candidate fits; otherwise create
 *     a separate parishioner flagged "needs review" saying who it might be. A visible duplicate beats a silent merge.
 *  4. Never throws into a save: syncMarriageSafe() logs and carries on.
 */

type Person = typeof schema.parishioners.$inferSelect;
type LinkCol = "baptism_id" | "communion_id" | "confirmation_id" | "marriage_spouse_id" | "orders_id";
const P = schema.parishioners;
const LINK_COLUMN = { baptism_id: P.baptismId, communion_id: P.communionId, confirmation_id: P.confirmationId, marriage_spouse_id: P.marriageSpouseId, orders_id: P.ordersId } as const;
const RECEIVED = ["received_here", "received_elsewhere"];

export interface Facts {
  type: string;
  linkCol: LinkCol;
  sourceId: number;
  name: string;
  father: string | null;
  mother: string | null;
  dob: [number | null, number | null, number | null];
  baptismRef: number | null;
  link: Record<string, number>;
  status: Record<string, string>;
  fill: Record<string, string | null>;
  soft: Record<string, string>;
  marital?: string;
  /** A Baptism entry's Communion / Confirmation cross-references: those entries belong to the same person. */
  cross?: { communion: number | null; confirmation: number | null };
}

export interface SyncStats { created: number; linked: number; updated: number; unchanged: number; flagged: number; errors: number; errorSamples: string[]; notes: string[] }
const emptyStats = (): SyncStats => ({ created: 0, linked: 0, updated: 0, unchanged: 0, flagged: 0, errors: 0, errorSamples: [], notes: [] });

// ---------------------------------------------------------------- tiny helpers
const nz = (v: unknown): string | null => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const clean = (s: string) => s.replace(/\s+/gu, " ").trim();
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const isBlank = (v: unknown) => v === null || v === undefined || v === "" || v === 0;
const describe = (people: Person[]) => people.slice(0, 3).map((p) => `#${p.id} ${p.fullName}`).join("; ");

/** snake_case patch -> Drizzle property names (drops anything that is not a real column). */
function props(patch: Record<string, unknown>): Record<string, unknown> {
  const t = resolveTable("parishioners");
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) { const c = t.columns.get(k); if (c) out[c.prop] = v; }
  return out;
}
/** Reads a Person by snake_case column name. */
function get(p: Person, col: string): unknown {
  const c = resolveTable("parishioners").columns.get(col);
  return c ? (p as unknown as Record<string, unknown>)[c.prop] : undefined;
}

// ---------------------------------------------------------------- facts for a marriage
type MarriageRow = typeof schema.matrimonyRecords.$inferSelect;
type SpouseRow = typeof schema.spouses.$inferSelect;

function spouseFacts(m: MarriageRow, s: SpouseRow, other: SpouseRow | undefined, parishName: string): Facts {
  const place = nz(m.placeOfMarriage) ?? parishName;
  const f: Facts = {
    type: "marriage", linkCol: "marriage_spouse_id", sourceId: s.id,
    name: clean(`${s.givenName ?? ""} ${s.surname ?? ""}`),
    father: s.fatherName ?? null, mother: s.motherName ?? null,
    dob: [num(s.dateOfBirthYear), num(s.dateOfBirthMonth), num(s.dateOfBirthDay)],
    baptismRef: num(s.baptismRegisterRef),
    link: { marriage_spouse_id: s.id, matrimony_id: m.id },
    status: { matrimony_status: "received_here" },
    fill: {
      marriage_date: m.dateOfMarriage ?? null, marriage_place: place, residence: s.domicile ?? null,
      sex: s.role === "groom" ? "male" : "female",
      spouse_name: other ? clean(`${other.givenName ?? ""} ${other.surname ?? ""}`) : null,
    },
    soft: {}, marital: "married_church",
  };
  // Mentions where they were baptised without linking a Baptism entry: still evidence, used only while unknown.
  const bPlace = nz(s.baptismPlace);
  if (f.baptismRef === null && (bPlace !== null || s.baptismDate)) {
    if (bPlace !== null) {
      const l = bPlace.toLowerCase();
      const here = l.includes(parishName.toLowerCase()) || l.includes("clementina") || l.includes("this parish");
      f.soft.baptised_status = here ? "baptised_here" : "baptised_elsewhere";
      f.fill.baptism_place = bPlace;
    }
    f.fill.baptism_date = s.baptismDate ?? null;
  }
  return f;
}

// ---------------------------------------------------------------- matching + writing
class Syncer {
  stats = emptyStats();
  constructor(public tx: Executor, private username: string, private parishName: string) {}

  private async findByLink(col: LinkCol, id: number): Promise<Person | null> {
    const [row] = await this.tx.select().from(P).where(and(eq(LINK_COLUMN[col], id), eq(P.isArchived, 0))).orderBy(asc(P.id)).limit(1);
    return row ?? null;
  }

  private async findByNameKey(key: string): Promise<Person[]> {
    if (!key) return [];
    return this.tx.select().from(P).where(and(eq(P.nameKey, key), eq(P.isArchived, 0))).orderBy(asc(P.id));
  }

  private slotFree = (p: Person, col: LinkCol) => isBlank(get(p, col));

  private compatible(c: Person, f: Facts): boolean {
    return parentsCompatible(c.fatherName, f.father) && parentsCompatible(c.motherName, f.mother) && birthYearsCompatible(num(c.dateOfBirthYear), f.dob[0]);
  }

  /** Matching on a parent's name or birth year, not on the name alone. */
  private strongEvidence(c: Person, f: Facts): boolean {
    const eq2 = (a: string | null | undefined, b: string | null | undefined) => nameKey(a) !== "" && nameKey(a) === nameKey(b);
    return eq2(c.fatherName, f.father) || eq2(c.motherName, f.mother) || (f.dob[0] !== null && num(c.dateOfBirthYear) === f.dob[0]);
  }

  async apply(f: Facts): Promise<void> {
    let person = await this.findByLink(f.linkCol, f.sourceId);
    let review: string | null = null;

    // 1. Strongest evidence: the entry points at a Baptism entry that a parishioner already owns.
    if (!person && f.baptismRef !== null) {
      const owner = await this.findByLink("baptism_id", f.baptismRef);
      if (owner && this.slotFree(owner, f.linkCol)) person = owner;
      else if (owner) review = `Its baptism entry already belongs to #${owner.id} ${owner.fullName}, who has a different ${f.type} entry linked.`;
    }

    // 2. Same name written in any order, accepted only when exactly one candidate fits.
    if (!person && review === null) {
      if (tokens(f.name).length < 2) {
        review = `Only one name is recorded in the ${f.type} register. Please complete the full name.`;
      } else {
        // Namesakes whose recorded parents or birth year CONTRADICT this entry are other people: ignored silently.
        const compatible = (await this.findByNameKey(nameKey(f.name))).filter((c) => this.compatible(c, f));
        const fitting = compatible.filter((c) => this.slotFree(c, f.linkCol));
        const taken = compatible.filter((c) => !this.slotFree(c, f.linkCol));
        const only = fitting[0];
        if (fitting.length === 1 && only && (compatible.length === 1 || this.strongEvidence(only, f))) person = only;
        else if (fitting.length === 1) review = `Might be ${describe(fitting)}, but other people could fit and nothing else confirms it. Not linked automatically.`;
        else if (fitting.length > 1) review = `Could be any of: ${describe(fitting)}. Not linked automatically.`;
        else if (taken.length) review = `Same name and compatible details as ${describe(taken)}, who already has a different ${f.type} entry linked: possibly entered twice.`;
      }
    }

    if (person) await this.updateExisting(person, f, review);
    else await this.createNew(f, review);
    if (f.cross) { const owner = await this.findByLink(f.linkCol, f.sourceId); if (owner) await this.follow(owner, f.cross); }
  }

  /** The Baptism entry's Comm/Cfrm cross-references name this person's Communion and Confirmation entries: link them too. */
  private async follow(person: Person, cross: NonNullable<Facts["cross"]>): Promise<void> {
    for (const [type, linkCol] of [["communion", "communion_id"], ["confirmation", "confirmation_id"]] as const) {
      const rid = cross[type];
      if (!rid) continue;
      const fresh = (await this.tx.select().from(P).where(eq(P.id, person.id)).limit(1))[0] ?? person;
      if (!isBlank(get(fresh, linkCol)) || (await this.findByLink(linkCol, rid))) continue;
      const facts = await factsFor(this.tx, type, rid, this.parishName);
      if (facts) await this.updateExisting(fresh, facts, null);
    }
  }

  /** One record at a time inside a SAVEPOINT: a failure is counted and skipped, and cannot abort the surrounding run. */
  async guarded(label: string, work: () => Promise<void>): Promise<void> {
    const outer = this.tx;
    try {
      await outer.transaction(async (sp) => { this.tx = sp as unknown as Executor; await work(); });
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errorSamples.length < 5) this.stats.errorSamples.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(JSON.stringify({ level: "error", msg: "parishioner sync record failed", label, err: String(e) }));
    } finally { this.tx = outer; }
  }

  private async updateExisting(p: Person, f: Facts, reviewNote: string | null): Promise<void> {
    const patch: Record<string, unknown> = {};
    const newLink = isBlank(get(p, f.linkCol));
    let note = reviewNote;

    // Either Holy Matrimony or Holy Orders: never write "received" on top of a recorded ordination.
    const blockedByOrders = f.type === "marriage" && RECEIVED.includes(p.ordersStatus);

    if (newLink) {
      for (const [col, val] of Object.entries(f.link)) if (isBlank(get(p, col))) patch[col] = val;
      if (blockedByOrders) {
        note ??= "Holy Orders is recorded for this person, so Holy Matrimony was not marked as received. Holy Matrimony and Holy Orders are either/or: please check which is correct.";
      } else {
        // The register is the evidence: its sacrament is received, whatever was guessed before.
        for (const [col, val] of Object.entries(f.status)) if (get(p, col) !== val) patch[col] = val;
      }
    }
    for (const [col, val] of Object.entries(f.fill)) {
      if (blockedByOrders && ["marriage_date", "marriage_place", "spouse_name"].includes(col)) continue;
      if (nz(val) !== null && nz(get(p, col)) === null) patch[col] = val;
    }
    for (const [col, val] of Object.entries(f.soft)) {
      const cur = get(p, col);
      if ((cur === "unknown" || cur == null) && !(col in patch)) patch[col] = val;
    }
    if (isBlank(p.dateOfBirthYear) && f.dob[0] !== null) {
      [patch.date_of_birth_year, patch.date_of_birth_month, patch.date_of_birth_day] = f.dob;
    }
    if (nz(f.father) !== null && nz(p.fatherName) === null && isBlank(p.fatherUnknown)) patch.father_name = clean(f.father!);
    if (nz(f.mother) !== null && nz(p.motherName) === null && isBlank(p.motherUnknown)) patch.mother_name = clean(f.mother!);
    if (f.marital && !blockedByOrders && (p.maritalStatus === null || p.maritalStatus === "" || p.maritalStatus === "single")) patch.marital_status = f.marital;
    if (note !== null && isBlank(p.needsReview)) { patch.needs_review = 1; patch.review_note = note.slice(0, 400); }

    if (Object.keys(patch).length) {
      patch.updated_by = this.username;
      await this.tx.update(P).set(props(patch) as never).where(eq(P.id, p.id));
      await logAudit({ table: "parishioners", recordId: p.id, action: "update", username: this.username, details: { sync: f.type, ...patch } }, this.tx);
      this.stats[newLink ? "linked" : "updated"]++;
      this.stats.notes.push(`${p.fullName}: ${newLink ? "linked to" : "details added from"} the ${f.type} register`);
      if (patch.needs_review) this.stats.flagged++;
    } else {
      this.stats.unchanged++;
    }
  }

  private async createNew(f: Facts, reviewNote: string | null): Promise<void> {
    const row: Record<string, unknown> = { full_name: f.name, name_key: nameKey(f.name) || null, data_source: "registers" };
    Object.assign(row, f.link, f.status, f.soft);
    for (const [col, val] of Object.entries(f.fill)) if (nz(val) !== null) row[col] = val;
    if (f.dob[0] !== null) [row.date_of_birth_year, row.date_of_birth_month, row.date_of_birth_day] = f.dob;
    if (nz(f.father) !== null) row.father_name = clean(f.father!);
    if (nz(f.mother) !== null) row.mother_name = clean(f.mother!);
    if (f.marital) row.marital_status = f.marital;

    // The entry names a Baptism entry nobody owns yet: keep the pointer.
    if (f.baptismRef !== null && row.baptism_id === undefined && !(await this.findByLink("baptism_id", f.baptismRef))) {
      const [b] = await this.tx.select({ id: schema.baptismRecords.id }).from(schema.baptismRecords).where(eq(schema.baptismRecords.id, f.baptismRef)).limit(1);
      if (b) { row.baptism_id = f.baptismRef; row.baptised_status = "baptised_here"; }
    }
    let note = reviewNote;
    if (note === null) {
      const near = await this.nearDuplicates(f);
      if (near.length) note = `Possibly the same person as ${describe(near)} (the name is written differently).`;
    }
    if (note !== null) { row.needs_review = 1; row.review_note = note.slice(0, 400); this.stats.flagged++; }
    row.created_by = this.username; row.updated_by = this.username;

    const [created] = await this.tx.insert(P).values(props(row) as never).returning({ id: P.id });
    await logAudit({ table: "parishioners", recordId: created!.id, action: "create", username: this.username, details: { sync: f.type, ...row } }, this.tx);
    this.stats.created++;
    this.stats.notes.push(`${f.name}: added to the Parishioners list${note ? " (needs review)" : ""}`);
  }

  /** Active parishioners whose name looks like an abbreviation/expansion of this one (flag only, never merge). */
  private async nearDuplicates(f: Facts): Promise<Person[]> {
    const words = tokens(f.name).filter((w) => w.length >= 3);
    if (!words.length) return [];
    const candidates = await this.tx.select().from(P)
      .where(and(eq(P.isArchived, 0), or(...words.map((w) => ilike(P.nameKey, `%${w.replace(/[\\%_]/g, "\\$&")}%`)))!)).limit(300);
    const mine = nameKey(f.name);
    return candidates.filter((o) =>
      nameKey(o.fullName) !== mine && looksLikeSamePerson(f.name, o.fullName)
      && parentsCompatible(o.fatherName, f.father) && parentsCompatible(o.motherName, f.mother) && birthYearsCompatible(num(o.dateOfBirthYear), f.dob[0]),
    ).slice(0, 3);
  }
}

const isThisParish = (place: string, parish: string) => { const l = place.toLowerCase(); return l.includes(parish.toLowerCase()) || l.includes("clementina") || l.includes("this parish"); };

/** A baptism place/date written on a LATER sacrament's entry: evidence, used only while the baptism status is unknown. */
function addBaptismHint(f: Facts, place: string | null, date: string | null, parish: string): void {
  const pl = nz(place);
  if (f.baptismRef !== null || (pl === null && !date)) return;
  if (pl !== null) { f.soft.baptised_status = isThisParish(pl, parish) ? "baptised_here" : "baptised_elsewhere"; f.fill.baptism_place = pl; }
  f.fill.baptism_date = date;
}

type Reg = "baptism" | "communion" | "confirmation" | "holy_orders" | "matrimony";

/** Builds the register-neutral facts for one entry (null if it is missing or archived). Marriage is handled spouse-by-spouse elsewhere. */
async function factsFor(tx: Executor, type: "baptism" | "communion" | "confirmation" | "holy_orders", id: number, parish: string): Promise<Facts | null> {
  const dobOf = (r: { dateOfBirthYear: unknown; dateOfBirthMonth: unknown; dateOfBirthDay: unknown }): Facts["dob"] => [num(r.dateOfBirthYear), num(r.dateOfBirthMonth), num(r.dateOfBirthDay)];
  if (type === "baptism") {
    const [b] = await tx.select().from(schema.baptismRecords).where(and(eq(schema.baptismRecords.id, id), eq(schema.baptismRecords.isArchived, 0))).limit(1);
    if (!b) return null;
    return {
      type, linkCol: "baptism_id", sourceId: b.id, name: clean(`${b.givenName ?? ""} ${b.surname ?? ""}`), father: b.fatherName ?? null, mother: b.motherName ?? null,
      dob: dobOf(b), baptismRef: null, link: { baptism_id: b.id }, status: { baptised_status: "baptised_here" },
      fill: { baptism_date: b.dateOfBaptism ?? null, baptism_place: nz(b.placeOfBaptism) ?? parish }, soft: {},
      cross: { communion: num(b.communionRef), confirmation: num(b.confirmationRef) },
    };
  }
  if (type === "communion") {
    const [c] = await tx.select().from(schema.communionRecords).where(and(eq(schema.communionRecords.id, id), eq(schema.communionRecords.isArchived, 0))).limit(1);
    if (!c) return null;
    const f: Facts = {
      type, linkCol: "communion_id", sourceId: c.id, name: clean(c.fullName ?? ""), father: c.fatherName ?? null, mother: c.motherName ?? null, dob: [null, null, null],
      baptismRef: num(c.baptismRegisterRef), link: { communion_id: c.id }, status: { communion_status: "received_here" },
      fill: { communion_date: c.dateOfCommunion ?? null, communion_place: nz(c.place) ?? parish }, soft: {},
    };
    addBaptismHint(f, c.placeOfBaptism ?? null, null, parish);
    return f;
  }
  if (type === "confirmation") {
    const [c] = await tx.select().from(schema.confirmationRecords).where(and(eq(schema.confirmationRecords.id, id), eq(schema.confirmationRecords.isArchived, 0))).limit(1);
    if (!c) return null;
    const f: Facts = {
      type, linkCol: "confirmation_id", sourceId: c.id, name: clean(c.fullName ?? ""), father: c.fatherName ?? null, mother: c.motherName ?? null, dob: [null, null, null],
      baptismRef: num(c.baptismRegisterRef), link: { confirmation_id: c.id }, status: { confirmation_status: "received_here" },
      fill: { confirmation_date: c.dateOfConfirmation ?? null, confirmation_place: nz(c.place) ?? parish, confirmation_name: c.confirmationName ?? null }, soft: {},
    };
    addBaptismHint(f, c.baptismPlace ?? null, null, parish);
    return f;
  }
  const [o] = await tx.select().from(schema.holyOrders).where(and(eq(schema.holyOrders.id, id), eq(schema.holyOrders.isArchived, 0))).limit(1);
  if (!o) return null;
  const f: Facts = {
    type: "orders", linkCol: "orders_id", sourceId: o.id, name: clean(o.fullName ?? ""), father: o.fatherName ?? null, mother: o.motherName ?? null, dob: dobOf(o),
    baptismRef: num(o.baptismRegisterRef), link: { orders_id: o.id }, status: { orders_status: "received_here" },
    fill: { orders_date: o.ordinationDate ?? null, orders_type: o.orderType ?? null }, soft: {},
  };
  addBaptismHint(f, o.placeBaptized ?? null, o.dateBaptized ?? null, parish);
  return f;
}

async function applyMarriage(syncer: Syncer, tx: Executor, marriageId: number, parishName: string): Promise<void> {
  const [m] = await tx.select().from(schema.matrimonyRecords).where(and(eq(schema.matrimonyRecords.id, marriageId), eq(schema.matrimonyRecords.isArchived, 0))).limit(1);
  if (!m) return;
  const spouses = await tx.select().from(schema.spouses).where(eq(schema.spouses.matrimonyId, marriageId)).orderBy(asc(schema.spouses.role));
  for (const s of spouses) await syncer.apply(spouseFacts(m, s, spouses.find((o) => o.id !== s.id), parishName));
}

/** Syncs both spouses of one marriage in a single transaction (all-or-nothing). */
export async function syncMarriageToParishioners(marriageId: number, username: string): Promise<SyncStats> {
  const parishName = await getSetting("parish_name", "Blessed Clementina Parish");
  return db().transaction(async (tx) => { const syncer = new Syncer(tx, username, parishName); await applyMarriage(syncer, tx, marriageId, parishName); return syncer.stats; });
}

/** One register entry -> the Parishioners list (called after every save of a baptism / communion / confirmation / orders entry). */
export async function syncRecordToParishioners(type: Reg, id: number, username: string): Promise<SyncStats> {
  if (type === "matrimony") return syncMarriageToParishioners(id, username);
  const parishName = await getSetting("parish_name", "Blessed Clementina Parish");
  return db().transaction(async (tx) => {
    const syncer = new Syncer(tx, username, parishName);
    const facts = await factsFor(tx, type, id, parishName);
    if (facts) await syncer.apply(facts);
    return syncer.stats;
  });
}

/** For the save path: a failed sync must never fail (or hide) a saved register entry. */
export async function syncRecordSafe(type: Reg, id: number, username: string): Promise<SyncStats | null> {
  try { return await syncRecordToParishioners(type, id, username); }
  catch (e) { console.error(JSON.stringify({ level: "error", msg: "parishioner sync failed", type, id, err: String(e) })); return null; }
}
export const syncMarriageSafe = (marriageId: number, username: string) => syncRecordSafe("matrimony", marriageId, username);

class Rollback extends Error {}

/**
 * Walks every active register entry (baptism, communion, confirmation, marriage, orders) in that order.
 * apply=false is a preview: the whole run happens inside a transaction that is rolled back, so the counts are exact but nothing is written.
 */
export async function runFullSync(username: string, apply: boolean): Promise<SyncStats & { applied: boolean }> {
  const parishName = await getSetting("parish_name", "Blessed Clementina Parish");
  let result: SyncStats | null = null;
  const work = async (tx: Executor) => {
    // Name keys drive matching; make sure every existing parishioner has one before we start.
    const missing = await tx.select({ id: P.id, name: P.fullName }).from(P).where(sql`${P.nameKey} is null`);
    for (const m of missing) await tx.update(P).set({ nameKey: nameKey(m.name) || null } as never).where(eq(P.id, m.id));
    const syncer = new Syncer(tx, username, parishName);
    const ids = async (t: { id: typeof schema.baptismRecords.id; isArchived: typeof schema.baptismRecords.isArchived }) => (await tx.select({ id: t.id }).from(t as never).where(eq(t.isArchived, 0)).orderBy(asc(t.id))).map((r) => Number((r as { id: number }).id));
    for (const id of await ids(schema.baptismRecords)) await syncer.guarded(`baptism #${id}`, async () => { const f = await factsFor(syncer.tx, "baptism", id, parishName); if (f) await syncer.apply(f); });
    for (const id of await ids(schema.communionRecords as never)) await syncer.guarded(`communion #${id}`, async () => { const f = await factsFor(syncer.tx, "communion", id, parishName); if (f) await syncer.apply(f); });
    for (const id of await ids(schema.confirmationRecords as never)) await syncer.guarded(`confirmation #${id}`, async () => { const f = await factsFor(syncer.tx, "confirmation", id, parishName); if (f) await syncer.apply(f); });
    for (const id of await ids(schema.matrimonyRecords as never)) await syncer.guarded(`marriage #${id}`, async () => applyMarriage(syncer, syncer.tx, id, parishName));
    for (const id of await ids(schema.holyOrders as never)) await syncer.guarded(`orders #${id}`, async () => { const f = await factsFor(syncer.tx, "holy_orders", id, parishName); if (f) await syncer.apply(f); });
    result = syncer.stats;
  };
  try {
    await db().transaction(async (tx) => { await work(tx); if (!apply) throw new Rollback(); });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  return { ...result!, applied: apply };
}
