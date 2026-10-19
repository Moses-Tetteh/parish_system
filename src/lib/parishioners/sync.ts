import "server-only";
import { and, asc, eq, ilike, or } from "drizzle-orm";
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
}

export interface SyncStats { created: number; linked: number; updated: number; unchanged: number; flagged: number; notes: string[] }
const emptyStats = (): SyncStats => ({ created: 0, linked: 0, updated: 0, unchanged: 0, flagged: 0, notes: [] });

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
  constructor(private tx: Executor, private username: string, private parishName: string) {}

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
      this.stats.notes.push(`${p.fullName}: ${newLink ? "linked to" : "details added from"} the marriage`);
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

/** Syncs both spouses of one marriage in a single transaction (all-or-nothing). */
export async function syncMarriageToParishioners(marriageId: number, username: string): Promise<SyncStats> {
  const parishName = await getSetting("parish_name", "Blessed Clementina Parish");
  return db().transaction(async (tx) => {
    const [m] = await tx.select().from(schema.matrimonyRecords).where(and(eq(schema.matrimonyRecords.id, marriageId), eq(schema.matrimonyRecords.isArchived, 0))).limit(1);
    const syncer = new Syncer(tx, username, parishName);
    if (!m) return syncer.stats;
    const spouses = await tx.select().from(schema.spouses).where(eq(schema.spouses.matrimonyId, marriageId)).orderBy(asc(schema.spouses.role));
    for (const s of spouses) {
      const other = spouses.find((o) => o.id !== s.id);
      await syncer.apply(spouseFacts(m, s, other, parishName));
    }
    return syncer.stats;
  });
}

/** For the save path: a failed sync must never fail (or hide) a saved marriage. */
export async function syncMarriageSafe(marriageId: number, username: string): Promise<SyncStats | null> {
  try {
    return await syncMarriageToParishioners(marriageId, username);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "parishioner sync failed", marriageId, err: String(e) }));
    return null;
  }
}

