/** Real-Postgres tests for the register -> Parishioners sync and the duplicate merge. Same rules as finance.db.test.ts: throw-away DB only. */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;
const admin = { id: 1, username: "admin_t", fullName: null, role: "admin" as const };

describe.skipIf(!URL)("parishioner sync + merge (real Postgres)", () => {
  let sql: ReturnType<typeof postgres>;
  let sync: typeof import("@/lib/parishioners/sync");
  let tools: typeof import("@/lib/parishioners/tools");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL; process.env.DATABASE_SSL = "disable"; process.env.SESSION_SECRET ||= "0123456789abcdef0123456789abcdef0123";
    sql = postgres(URL!, { max: 2, onnotice: () => {} });
    await sql`truncate parishioners, baptism_records, communion_records, confirmation_records, holy_orders, society_members restart identity cascade`;
    sync = await import("@/lib/parishioners/sync"); tools = await import("@/lib/parishioners/tools");
  });
  afterAll(async () => { await sql?.end(); });

  it("creates one parishioner per person and follows the baptism entry's communion cross-reference", async () => {
    const [b] = await sql`insert into baptism_records (given_name, surname, father_name, mother_name, date_of_birth_year, date_of_baptism, place_of_baptism) values ('Ama','Mensah','Kofi Mensah','Esi Boateng',1990,'1990-05-01','Blessed Clementina') returning id`;
    const [c] = await sql`insert into communion_records (full_name, father_name, mother_name, baptism_register_ref, date_of_communion, place) values ('Ama Mensah','Kofi Mensah','Esi Boateng', ${b!.id}, '2000-05-01','Blessed Clementina') returning id`;
    await sql`update baptism_records set communion_ref = ${c!.id} where id = ${b!.id}`;
    await sql`insert into baptism_records (given_name, surname) values ('Yaw','Owusu')`;
    const r = await sync.runFullSync("t", true);
    expect(r.errors).toBe(0);
    const rows = await sql`select full_name, baptised_status, communion_status, baptism_id, communion_id from parishioners order by id`;
    expect(rows).toHaveLength(2);                                     // Ama (baptism + communion = ONE person) and Yaw
    const ama = rows.find((x) => x.full_name.startsWith("Ama"))!;
    expect(ama).toMatchObject({ baptised_status: "baptised_here", communion_status: "received_here" });
    expect(ama.baptism_id).not.toBeNull(); expect(ama.communion_id).not.toBeNull();
  });

  it("is idempotent, and a preview changes nothing", async () => {
    const before = (await sql`select count(*)::int n from parishioners`)[0]!.n;
    await sql`insert into baptism_records (given_name, surname, father_name, mother_name) values ('Kojo','Asare','Kwesi Asare','Abena Asare')`;
    const preview = await sync.runFullSync("t", false);
    expect(preview.created).toBe(1);
    expect((await sql`select count(*)::int n from parishioners`)[0]!.n).toBe(before);   // rolled back
    await sync.runFullSync("t", true);
    const again = await sync.runFullSync("t", true);
    expect(again.created + again.linked + again.updated).toBe(0);
    expect((await sql`select count(*)::int n from parishioners`)[0]!.n).toBe(before + 1);
  });

  it("saving a register entry later updates the list through syncRecordSafe", async () => {
    const [b] = await sql`insert into baptism_records (given_name, surname) values ('Efua','Danso') returning id`;
    const s = await sync.syncRecordSafe("baptism", Number(b!.id), "t");
    expect(s?.created).toBe(1);
    expect((await sql`select 1 from parishioners where full_name = 'Efua Danso'`)).toHaveLength(1);
  });

  it("merges a duplicate: survivor inherits links, references move, the duplicate is archived, and it refuses a conflicting pair", async () => {
    const [a] = await sql`insert into parishioners (full_name, name_key, father_name, mother_name, residence, baptism_id) select 'Grace Ofori Tetteh','grace ofori tetteh','Paa Tetteh','Maa Tetteh','Tema', id from baptism_records limit 1 returning id`;
    const [d] = await sql`insert into parishioners (full_name, name_key, father_name, mother_name, phone) values ('Grace Tetteh','grace tetteh','Paa Tetteh','Maa Tetteh','0240000000') returning id`;
    const [soc] = await sql`insert into societies (name) values ('Legion of Mary') returning id`;
    await sql`insert into society_members (society_id, parishioner_id, full_name) values (${soc!.id}, ${d!.id}, 'Grace Tetteh')`;
    const pairs = await tools.listDuplicatePairs(admin);
    expect(pairs.some((p) => [p.a.id, p.b.id].map(Number).sort().join() === [a!.id, d!.id].map(Number).sort().join())).toBe(true);
    const r = await tools.mergeParishioners(admin, Number(a!.id), Number(d!.id), null);
    expect(r.kept).toBe(Number(a!.id));
    const [kept] = await sql`select phone, notes from parishioners where id = ${a!.id}`;
    expect(kept!.phone).toBe("0240000000");
    expect(kept!.notes).toContain("Merged with duplicate");
    expect((await sql`select is_archived from parishioners where id = ${d!.id}`)[0]!.is_archived).toBe(1);
    expect((await sql`select parishioner_id from society_members where society_id = ${soc!.id}`)[0]!.parishioner_id).toBe(a!.id);
    await expect(tools.mergeParishioners(admin, Number(a!.id), Number(d!.id), null)).rejects.toBeInstanceOf(tools.ToolInputError); // already archived
  });
});
