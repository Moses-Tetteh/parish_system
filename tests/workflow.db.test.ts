/** Real-Postgres tests for marriage-prep, candidates/sponsors/promotion and society dues. Throw-away DB only (see finance.db.test.ts). */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.TEST_DATABASE_URL;
const user = (role: "admin" | "priest" | "secretary") => ({ id: 1, username: `${role}_t`, fullName: null, role });

describe.skipIf(!URL)("workflow services (real Postgres)", () => {
  let sql: ReturnType<typeof postgres>;
  let prep: typeof import("@/lib/marriage-prep/service");
  let cand: typeof import("@/lib/candidates/service");
  let soc: typeof import("@/lib/societies/service");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL; process.env.DATABASE_SSL = "disable"; process.env.SESSION_SECRET ||= "0123456789abcdef0123456789abcdef0123";
    sql = postgres(URL!, { max: 2, onnotice: () => {} });
    await sql`truncate marriage_preparations, matrimony_records, sacrament_candidates, announcements, baptism_records, confirmation_records, communion_records, parishioners, societies cascade`;
    prep = await import("@/lib/marriage-prep/service"); cand = await import("@/lib/candidates/service"); soc = await import("@/lib/societies/service");
  });
  afterAll(async () => { await sql?.end(); });

  const fullPrep = { prenuptial_inquiry_done: 1, marriage_course_done: 1, groom_baptism_cert: 1, groom_confirmation_cert: 1, groom_freedom_proof: 1, bride_baptism_cert: 1, bride_confirmation_cert: 1, bride_freedom_proof: 1 };

  it("marriage prep: banns drive status + announcements; approval needs the priest and a complete file; conversion creates the marriage", async () => {
    const [gb] = await sql`insert into baptism_records (given_name, surname) values ('Kofi','Boateng') returning id`;
    const [bb] = await sql`insert into baptism_records (given_name, surname) values ('Ama','Owusu') returning id`;
    const [p] = await sql`insert into marriage_preparations ${sql({ groom_name: "Kofi Boateng", bride_name: "Ama Owusu", groom_domicile: "Tema <b>", groom_baptism_id: gb!.id, bride_baptism_id: bb!.id, proposed_date: "2026-12-12", banns_1_date: "2026-11-15", banns_2_date: "2026-11-22", ...fullPrep })} returning id`;
    const id = Number(p!.id);
    await prep.afterPrepSave(user("secretary"), id);
    expect((await sql`select status from marriage_preparations where id = ${id}`)[0]!.status).toBe("banns");
    let anns = await sql`select title, announcement_date::text d, content, status, is_archived from announcements where ref_id = ${id} order by ref_type`;
    expect(anns).toHaveLength(2);
    expect(anns[0]).toMatchObject({ title: "Banns of Marriage — 1st Publication", status: "approved", is_archived: 0 });
    expect(anns[0]!.content).toContain("Tema &lt;b&gt;");               // names are escaped into the announcement HTML

    await expect(prep.approve(user("priest"), id)).rejects.toThrow(/Banns have not been published three times/);
    await expect(prep.approve(user("secretary"), id)).rejects.toBeInstanceOf(prep.PrepForbiddenError);
    await sql`update marriage_preparations set banns_3_date = '2026-11-29' where id = ${id}`;
    await prep.afterPrepSave(user("secretary"), id);
    await prep.approve(user("priest"), id);
    expect((await sql`select status, approved_by from marriage_preparations where id = ${id}`)[0]).toMatchObject({ status: "approved", approved_by: "priest_t" });
    await prep.withdrawApproval(user("priest"), id);
    expect((await sql`select status from marriage_preparations where id = ${id}`)[0]!.status).toBe("banns");
    await prep.approve(user("priest"), id);

    await sql`update marriage_preparations set banns_2_date = null where id = ${id}`;     // clearing a date archives that announcement
    await prep.afterPrepSave(user("secretary"), id);
    expect((await sql`select count(*)::int n from announcements where ref_id = ${id} and is_archived = 0`)[0]!.n).toBe(2);
    await sql`update marriage_preparations set banns_2_date = '2026-11-22' where id = ${id}`;

    const mid = await prep.convertToMatrimony(user("secretary"), id, { dateOfMarriage: "2026-12-12", placeOfMarriage: null, minister: "Fr. A", witnesses: null, recordNo: "M-1" });
    const m = (await sql`select date_of_marriage::text d, banns_published_dates b, marriage_type t from matrimony_records where id = ${mid}`)[0]!;
    expect(m).toMatchObject({ d: "2026-12-12", t: "catholic" });
    expect(m.b).toContain("2026");
    expect((await sql`select count(*)::int n from spouses where matrimony_id = ${mid}`)[0]!.n).toBe(2);
    expect((await sql`select status, matrimony_id from marriage_preparations where id = ${id}`)[0]).toMatchObject({ status: "married", matrimony_id: String(mid) });
    expect((await sql`select count(*)::int n from announcements where ref_id = ${id} and is_archived = 0`)[0]!.n).toBe(0);   // banns come off the sheet
    expect((await sql`select marginal_notes n from baptism_records where id = ${gb!.id}`)[0]!.n).toContain("Married to Ama Owusu");
    await expect(prep.convertToMatrimony(user("secretary"), id, { dateOfMarriage: "2026-12-12", placeOfMarriage: null, minister: null, witnesses: null, recordNo: null })).rejects.toThrow(/already been entered/);
  });

  it("candidates: readiness gates promotion; sponsors are evaluated; promotion creates the entries atomically and links the baptism", async () => {
    const [b] = await sql`insert into baptism_records (given_name, surname, date_of_baptism) values ('Esi','Appiah','2010-01-01') returning id`;
    const [c] = await sql`insert into sacrament_candidates (program, full_name, father_name, mother_name, baptism_id, baptism_place, interview_result, stage) values ('confirmation','Esi Appiah','Kwame Appiah','Efua Appiah', ${b!.id}, 'Blessed Clementina','pending','catechumen') returning id`;
    const id = Number(c!.id), sec = user("secretary"), pri = user("priest");
    const input = { date: "2026-12-06", minister: "Bishop X", place: null, recordNo: "C-9", withBaptism: false, withConfirmation: false, withCommunion: false, force: false };
    await expect(cand.promote(sec, id, input)).rejects.toThrow(/Not ready/);
    expect((await sql`select count(*)::int n from confirmation_records`)[0]!.n).toBe(0);                 // nothing half-created

    await cand.recordSession(sec, "2026-11-01", [id], [id]); await cand.recordSession(sec, "2026-11-08", [id], [id]);
    await cand.recordSession(sec, "2026-11-08", [id], [id]);                                             // same date again: updates, never duplicates
    expect(await cand.attendanceFor(id)).toEqual({ held: 2, present: 2, percent: 100 });
    const bad = await cand.addSponsor(sec, id, { sponsorName: "Too Young", role: "sponsor", age: 12, isCatholic: true, isConfirmed: true, hasReceivedEucharist: true, isPractising: true, marriageRegular: true, isParent: false, parishionerId: null });
    expect(bad.eligibility).toBe("ineligible");
    await expect(cand.promote(sec, id, { ...input, force: true })).rejects.toThrow(/Not ready/);       // a secretary cannot override
    const good = await cand.addSponsor(sec, id, { sponsorName: "Ama Good", role: "godmother", age: 35, isCatholic: true, isConfirmed: true, hasReceivedEucharist: true, isPractising: true, marriageRegular: true, isParent: false, parishionerId: null });
    expect(good.eligibility).toBe("eligible");
    await sql`update sacrament_candidates set interview_result = 'passed' where id = ${id}`;
    await expect(cand.overrideSponsor(sec, id, 1, "x")).rejects.toBeInstanceOf(cand.CandidateForbiddenError);

    const summary = await cand.promote(sec, id, input);
    expect(summary).toMatch(/^Confirmation #\d+$/);
    const conf = (await sql`select full_name, sponsor_name, baptism_register_ref, date_of_confirmation::text d from confirmation_records`)[0]!;
    expect(conf).toMatchObject({ full_name: "Esi Appiah", sponsor_name: "Ama Good", d: "2026-12-06" });   // only the ELIGIBLE sponsor is written
    expect(String(conf.baptism_register_ref)).toBe(String(b!.id));
    const bap = (await sql`select confirmation_ref, marginal_notes from baptism_records where id = ${b!.id}`)[0]!;
    expect(bap.confirmation_ref).not.toBeNull(); expect(bap.marginal_notes).toContain("Confirmed on");
    expect((await sql`select candidate_status, stage from sacrament_candidates where id = ${id}`)[0]).toMatchObject({ candidate_status: "promoted", stage: "completed" });
    expect((await sql`select 1 from parishioners where full_name = 'Esi Appiah'`)).toHaveLength(1);     // the census follows
    await expect(cand.promote(pri, id, input)).rejects.toThrow(/already been entered/);
  });

  it("societies: dues accumulate per period, members leave without losing history, bad periods are refused", async () => {
    const [s] = await sql`insert into societies (name, group_type, dues_amount, dues_period) values ('Legion','society', 10, 'monthly') returning id`;
    const id = Number(s!.id), sec = user("secretary");
    await soc.addMember(sec, id, { parishionerId: null, fullName: "Kojo Mensah", office: "Treasurer", phone: null });
    const mem = (await sql`select id from society_members where society_id = ${id}`)[0]!;
    await soc.recordDues(sec, id, Number(mem.id), "2026-10", 6); await soc.recordDues(sec, id, Number(mem.id), "2026-10", 4);
    expect((await soc.societyOverview(sec, id, "2026-10")).paidBy.get(Number(mem.id))).toBe(10);
    await expect(soc.recordDues(sec, id, Number(mem.id), "2026-13", 5)).rejects.toBeInstanceOf(soc.SocietyError);
    await expect(soc.recordDues(sec, id, 999999, "2026-10", 5)).rejects.toThrow(/not found/);
    await soc.removeMember(sec, id, Number(mem.id));
    expect((await soc.societyOverview(sec, id, "2026-10")).members).toHaveLength(0);
    expect((await sql`select count(*)::int n from society_dues where society_id = ${id}`)[0]!.n).toBe(2);   // dues history kept
  });
});
