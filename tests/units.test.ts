import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { isValidIsoDate, formatPartialDate } from "@/lib/dates";
import { neutraliseFormula, toCsv } from "@/lib/csv";
import { roleCan, PERMISSION_ROLES } from "@/lib/auth/permissions";
import { passwordProblems, verifyPassword } from "@/lib/auth/password";
import { redact } from "@/lib/audit";

describe("dates", () => {
  it("rejects impossible calendar dates", () => {
    expect(isValidIsoDate("2020-02-29")).toBe(true);
    expect(isValidIsoDate("2021-02-29")).toBe(false);
    expect(isValidIsoDate("2020-13-01")).toBe(false);
    expect(isValidIsoDate("20-1-1")).toBe(false);
  });
  it("formats partially-known dates", () => {
    expect(formatPartialDate(1954)).toBe("1954");
    expect(formatPartialDate(1954, 3)).toBe("March 1954");
    expect(formatPartialDate(1954, 3, 9)).toBe("9 March 1954");
  });
});

describe("csv", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) expect(neutraliseFormula(bad).startsWith("'")).toBe(true);
    expect(neutraliseFormula("Mary")).toBe("Mary");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv(["a"], [['x,"y"\nz']])).toContain('"x,""y""\nz"');
  });
});

describe("permissions", () => {
  it("keeps the PPC secretary out of the registers and exports", () => {
    expect(roleCan("ppc_secretary", "registers")).toBe(false);
    expect(roleCan("ppc_secretary", "export")).toBe(false);
    expect(roleCan("ppc_secretary", "financials.members")).toBe(true);
  });
  it("keeps the secretary out of Members & Dues and admin areas", () => {
    expect(roleCan("secretary", "financials.members")).toBe(false);
    expect(roleCan("secretary", "users.manage")).toBe(false);
    expect(roleCan("secretary", "sensitive.sick")).toBe(false);
  });
  it("denies unknown / missing roles", () => {
    expect(roleCan(null, "registers")).toBe(false);
    expect(Object.keys(PERMISSION_ROLES).length).toBeGreaterThan(15);
  });
});

describe("passwords", () => {
  it("accepts hashes created by PHP password_hash ($2y$)", async () => {
    const php = "$2y$" + bcrypt.hashSync("Sunday#Mass1", 10).slice(4);
    expect(await verifyPassword("Sunday#Mass1", php)).toBe(true);
    expect(await verifyPassword("wrong", php)).toBe(false);
  });
  it("never authenticates an unknown user", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });
  it("rejects the legacy default and weak passwords", () => {
    expect(passwordProblems("admin123").length).toBeGreaterThan(0);
    expect(passwordProblems("Parish#Secure2026", "bob")).toEqual([]);
  });
});

describe("audit redaction", () => {
  it("never writes credentials to the audit trail", () => {
    expect(redact({ name: "A", password: "x", nested: { passwordHash: "y", ok: 1 } })).toEqual({ name: "A", password: "[redacted]", nested: { passwordHash: "[redacted]", ok: 1 } });
  });
});

describe("optimistic concurrency token", () => {
  it("accepts Postgres timestamps and rejects injection", async () => {
    const { isValidVersion } = await import("@/lib/registers/concurrency");
    expect(isValidVersion("2026-10-17 12:00:00.123456+00")).toBe(true);
    expect(isValidVersion("2026-10-17 12:00:00+00:00")).toBe(true);
    expect(isValidVersion("x'; drop table users;--")).toBe(false);
  });
});

import { amountToWords } from "@/lib/financials/words";
import { allocateWaterfall, expectedAmountFor, statusFor } from "@/lib/financials/dues";
import { resolvePeriod } from "@/lib/financials/period";
import { toPesewas } from "@/lib/financials/money";

describe("financials: amount in words", () => {
  it("matches the PHP wording", () => {
    expect(amountToWords(1250.5)).toBe("One Thousand Two Hundred Fifty Ghana Cedis and Fifty Pesewas Only");
    expect(amountToWords(0)).toBe("Zero Ghana Cedis Only");
    expect(amountToWords(21)).toBe("Twenty-One Ghana Cedis Only");
    expect(amountToWords(1_000_000.01)).toBe("One Million Ghana Cedis and One Pesewas Only");
  });
  it("is not thrown by float drift", () => { expect(amountToWords(0.29)).toBe("Zero Ghana Cedis and Twenty-Nine Pesewas Only"); });
});

describe("financials: dues waterfall", () => {
  const cat = { isTiered: false, annualDuesAmount: "50.00", tierChildAmount: null, tierYouthAmount: null, tierAdultAmount: null };
  it("clears the oldest year first, whatever year the payment was tagged to", () => {
    const w = allocateWaterfall(5000, 7500, 2024, 2026); // owes 3 x 50, paid 75
    expect(w.years[2024]).toMatchObject({ paid: 5000, balance: 0 });
    expect(w.years[2025]).toMatchObject({ paid: 2500, balance: 2500 });
    expect(w.years[2026]).toMatchObject({ paid: 0, balance: 5000 });
    expect(w.arrears).toBe(7500);
    expect(w.advance).toBe(0);
  });
  it("turns any surplus into an advance balance", () => {
    const w = allocateWaterfall(5000, 17000, 2026, 2026);
    expect(w.arrears).toBe(0);
    expect(w.advance).toBe(12000);
  });
  it("uses tier amounts when tiered, flat amount otherwise", () => {
    expect(expectedAmountFor(cat, "child")).toBe(5000);
    const tiered = { ...cat, isTiered: true, tierChildAmount: "10", tierYouthAmount: "20", tierAdultAmount: "50" };
    expect(expectedAmountFor(tiered, "child")).toBe(1000);
    expect(expectedAmountFor(tiered, "youth")).toBe(2000);
    expect(expectedAmountFor(tiered, null)).toBe(5000);
  });
  it("labels status", () => {
    expect(statusFor(0, 5000)).toBe("Unpaid");
    expect(statusFor(2000, 3000)).toBe("Partial");
    expect(statusFor(5000, 0)).toBe("Paid");
    expect(statusFor(6000, -1000)).toBe("Overpaid");
  });
  it("rounds money to whole pesewas", () => { expect(toPesewas("19.995")).toBe(2000); expect(toPesewas("0.1") + toPesewas("0.2")).toBe(30); });
});

describe("financials: period", () => {
  it("month+year wins and resolves to the calendar month", () => {
    expect(resolvePeriod({ month: "2", year: "2028", start: "2028-01-01" })).toEqual({ start: "2028-02-01", end: "2028-02-29", label: "February 2028" });
  });
  it("ignores invalid custom dates", () => {
    const p = resolvePeriod({ start: "nope", end: "2026-13-40" });
    expect(p.start.endsWith("-01-01")).toBe(true);
  });
});

import { sanitizeRich, richToBlocks } from "@/lib/announcements/sanitize";
import { assertGoogleCsvUrl, mapColumns, matchCategory, parseDate, planSync } from "@/lib/announcements/sync";
import { nextSunday } from "@/lib/announcements/categories";

describe("announcements: sanitizer", () => {
  it("drops scripts, attributes, links and handlers but keeps formatting", () => {
    const out = sanitizeRich('<p onclick="x()">Hi <b>there</b><script>alert(1)</script><a href="javascript:1">l</a><img src=x onerror=alert(1)></p>');
    expect(out).not.toMatch(/script|onclick|onerror|href|<a|<img/i);
    expect(out).toContain("<b>there</b>");
  });
  it("is idempotent and turns plain text newlines into <br>", () => {
    expect(sanitizeRich("Line 1\nLine <2>")).toBe("<p>Line 1<br>Line &lt;2&gt;</p>");
    expect(sanitizeRich("<script>alert(1)</script>")).not.toContain("<script");
    const once = sanitizeRich("<ul><li>a</li></ul>");
    expect(sanitizeRich(once)).toBe(once);
  });
  it("converts to print blocks with markers", () => {
    const b = richToBlocks("<p><b>Bold</b> text</p><ol><li>one</li><li>two</li></ol>");
    expect(b.map((x) => x.kind)).toEqual(["p", "li", "li"]);
    expect(b[1]).toMatchObject({ marker: "1." });
    expect(b[0]!.kind === "p" && b[0]!.runs[0]).toMatchObject({ text: "Bold", bold: true });
  });
});

describe("announcements: google form sync", () => {
  it("maps columns without reusing one for two fields", () => {
    const c = mapColumns(["Timestamp", "Your Name", "Contact (phone or email)", "Type of announcement", "Announcement message", "Date to be announced"]);
    expect(c).toMatchObject({ timestamp: 0, name: 1, contact: 2, category: 3, content: 4, announcement_date: 5 });
  });
  it("matches categories by keyword, defaulting to notice", () => {
    expect(matchCategory("Funeral / burial")).toBe("funeral");
    expect(matchCategory("General meeting")).toBe("general_meetings");
    expect(matchCategory("whatever")).toBe("notice");
  });
  it("parses day-first dates, falling back to month-first only when impossible", () => {
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("10/25/2026 14:03:11")).toBe("2026-10-25");
    expect(parseDate("5 Oct 2026")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("plans inserts, skipping known / blank / duplicate rows and reporting why", () => {
    const rows = [["Timestamp", "Announcement"], ["t1", "<b>x</b>"], ["t1", "dup"], ["t2", ""], ["", "no id"], ["t3", "ok"]];
    const p = planSync(rows, new Set(["t3"]), "2026-10-24");
    expect(p.rows.map((r) => r.responseId)).toEqual(["t1"]);
    expect(p.skipped).toBe(4);
    expect(p.errors).toHaveLength(2);
    expect(p.rows[0]!.announcementDate).toBe("2026-10-24");
  });
  it("refuses sync URLs that are not https Google hosts (SSRF guard)", () => {
    expect(() => assertGoogleCsvUrl("http://docs.google.com/x")).toThrow();
    expect(() => assertGoogleCsvUrl("https://169.254.169.254/latest")).toThrow();
    expect(() => assertGoogleCsvUrl("https://docs.google.com.evil.com/x")).toThrow();
    expect(assertGoogleCsvUrl("https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv").hostname).toBe("docs.google.com");
  });
  it("finds the coming Sunday", () => { expect(nextSunday("2026-10-24")).toBe("2026-10-25"); expect(nextSunday("2026-10-25")).toBe("2026-10-25"); });
});

import { assess, blocker, chooseKeeper, combine, findPairs } from "@/lib/parishioners/merger";

describe("parishioners: merger", () => {
  const base = { id: 1, full_name: "Mary Ama Mensah", father_name: "Kofi Mensah", mother_name: "Esi Boateng", date_of_birth_year: 1990, baptism_id: 5, residence: "Ashaiman" };
  const twin = { id: 2, full_name: "Mary Mensah", father_name: "K. Kofi Mensah", mother_name: "Esi Boateng", date_of_birth_year: null, baptism_id: null, communion_id: 9, communion_status: "received_here", communion_place: "Ashaiman" };
  it("treats matching parents as the strongest tier and auto-mergeable", () => {
    const a = assess(base, twin);
    expect(a?.tier).toBe("same_parents");
    expect(a?.auto).toBe(true);
  });
  it("rejects different parents or contradictory birth years", () => {
    expect(assess(base, { ...twin, father_name: "Yaw Owusu" })).toBeNull();
    expect(assess(base, { ...twin, date_of_birth_year: 1960 })).toBeNull();
  });
  it("blocks when two different register entries or sexes are involved", () => {
    expect(blocker({ baptism_id: 1 }, { baptism_id: 2 })).toMatch(/Baptism/);
    expect(blocker({ sex: "male" }, { sex: "female" })).toMatch(/sex/);
    expect(assess(base, { ...twin, baptism_id: 99 })?.auto).toBe(false);
  });
  it("keeps the fuller record, inherits blanks, links and the longer name, and retires the other", () => {
    const [keep, drop] = chooseKeeper(base, twin);
    expect(keep.id).toBe(1);
    const c = combine(keep, drop, "2026-10-24");
    expect(c.keep).toMatchObject({ communion_id: 9, communion_status: "received_here", communion_place: "Ashaiman", needs_review: 0 });
    expect(String(c.keep.notes)).toContain("Merged with duplicate #2");
    expect(c.keep.full_name).toBeUndefined();            // the kept name is already the longer one
    expect(c.drop).toMatchObject({ is_archived: 1, baptism_id: null, communion_id: null });
  });
  it("finds pairs through shared name words and honours dismissals", () => {
    const rows = [base, twin, { id: 3, full_name: "Kwame Asante" }];
    expect(findPairs(rows, new Set()).map((p) => [p.a.id, p.b.id])).toEqual([[1, 2]]);
    expect(findPairs(rows, new Set(["1-2"]))).toEqual([]);
  });
});

import { parseWorkflow } from "@/lib/settings-admin/fields";
describe("settings: workflow validation", () => {
  const form = (o: Record<string, string>) => (k: string) => (k in o ? o[k]! : null);
  const good = { certificate_marriage_validity_months: "6", sponsor_min_age: "16", candidate_min_attendance_percent: "75", certificate_signoff_required: "1" };
  it("accepts valid input and normalises checkboxes", () => {
    const r = parseWorkflow(form(good));
    expect("values" in r && r.values).toMatchObject({ sponsor_min_age: "16", certificate_signoff_required: "1", epiphany_on_sunday: "0" });
  });
  it("rejects out-of-range or non-numeric values", () => {
    expect(parseWorkflow(form({ ...good, sponsor_min_age: "5" }))).toHaveProperty("error");
    expect(parseWorkflow(form({ ...good, candidate_min_attendance_percent: "101" }))).toHaveProperty("error");
    expect(parseWorkflow(form({ ...good, certificate_marriage_validity_months: "abc" }))).toHaveProperty("error");
  });
});

import { approvalBlockers, bannsCheck, checklist, deriveStatus, requiredDispensation, splitName, type PrepFacts } from "@/lib/marriage-prep/rules";
import { attendancePercent, evaluateSponsor, promotionPlan, readiness, sponsorFactsFromCensus } from "@/lib/candidates/rules";

describe("marriage prep rules", () => {
  const ready: PrepFacts = {
    status: "inquiry", groomReligion: "catholic", brideReligion: "catholic", prenuptialInquiryDone: 1, marriageCourseDone: 1,
    groomBaptismCert: 1, groomConfirmationCert: 1, groomFreedomProof: 1, brideBaptismCert: 1, brideConfirmationCert: 1, brideFreedomProof: 1,
    dispensationType: "none", dispensationStatus: "not_needed", banns1Date: "2026-11-01", banns2Date: "2026-11-08", banns3Date: "2026-11-15",
    bannsDispensed: 0, proposedDate: "2026-11-28", approvedAt: null, matrimonyId: null,
  };
  it("is ready to approve when everything is in place", () => { expect(approvalBlockers(ready)).toEqual([]); });
  it("lists exactly what is missing", () => {
    const b = approvalBlockers({ ...ready, brideFreedomProof: 0, banns3Date: null, proposedDate: null });
    expect(b).toContain("Missing: Bride: proof of freedom to marry");
    expect(b).toContain("Banns have not been published three times (or dispensed by the Ordinary).");
    expect(b).toContain("No wedding date has been proposed.");
  });
  it("needs a dispensation for a mixed or disparity-of-cult marriage until granted", () => {
    expect(requiredDispensation({ groomReligion: "catholic", brideReligion: "other_christian" })).toBe("mixed_religion");
    expect(requiredDispensation({ groomReligion: "catholic", brideReligion: "non_christian" })).toBe("disparity_of_cult");
    expect(requiredDispensation({ groomReligion: "catholic", brideReligion: "catholic" })).toBe("none");
    expect(approvalBlockers({ ...ready, brideReligion: "other_christian" }).join()).toMatch(/mixed marriage/);
    expect(approvalBlockers({ ...ready, brideReligion: "other_christian", dispensationStatus: "granted", dispensationType: "mixed_religion" })).toEqual([]);
  });
  it("does not require confirmation/baptism papers a non-Catholic cannot have", () => {
    const c = checklist({ ...ready, brideReligion: "non_christian", brideBaptismCert: 0, brideConfirmationCert: 0 });
    expect(c.find((i) => i.label === "Bride: recent baptismal certificate")!.required).toBe(false);
    expect(c.find((i) => i.label === "Bride: confirmation certificate")!.required).toBe(false);
  });
  it("requires the third banns before the wedding unless dispensed", () => {
    expect(approvalBlockers({ ...ready, proposedDate: "2026-11-15" }).join()).toMatch(/third publication/);
    expect(approvalBlockers({ ...ready, proposedDate: "2026-11-15", bannsDispensed: 1 }).join()).not.toMatch(/third publication/);
  });
  it("derives status from what is recorded", () => {
    expect(deriveStatus({ ...ready, prenuptialInquiryDone: 0, banns1Date: null })).toBe("inquiry");
    expect(deriveStatus({ ...ready, banns1Date: null })).toBe("documents");
    expect(deriveStatus(ready)).toBe("banns");
    expect(deriveStatus({ ...ready, approvedAt: "2026-11-20" })).toBe("approved");
    expect(deriveStatus({ ...ready, matrimonyId: 4, approvedAt: "x" })).toBe("married");
    expect(deriveStatus({ ...ready, status: "cancelled", matrimonyId: 4 })).toBe("cancelled");
  });
  it("validates banns order and warns about non-Sundays", () => {
    expect(bannsCheck({ banns1Date: "2026-11-08", banns2Date: "2026-11-01" }).error).toMatch(/in order/);
    expect(bannsCheck({ banns2Date: "2026-11-08" }).error).toMatch(/1st, then 2nd/);
    const r = bannsCheck({ banns1Date: "2026-11-02" });
    expect(r.error).toBeUndefined(); expect(r.warnings[0]).toMatch(/not a Sunday/);
  });
  it("splits names on the last word", () => { expect(splitName("Mary  Ama Mensah")).toEqual(["Mary Ama", "Mensah"]); expect(splitName("Cher")).toEqual(["Cher", ""]); });
});

describe("candidates + sponsors", () => {
  const full = { sponsorAge: 30, isCatholic: 1, isConfirmed: 1, hasReceivedEucharist: 1, isPractising: 1, marriageRegular: 1, isParentOfCandidate: false };
  it("distinguishes ineligible (a hard no) from needs-review (unknown)", () => {
    expect(evaluateSponsor(full, 16).eligibility).toBe("eligible");
    expect(evaluateSponsor({ ...full, sponsorAge: 15 }, 16).eligibility).toBe("ineligible");
    expect(evaluateSponsor({ ...full, isConfirmed: null }, 16)).toMatchObject({ eligibility: "needs_review", issues: ["Confirmation not verified."] });
    expect(evaluateSponsor({ ...full, isConfirmed: 0, isPractising: null }, 16).eligibility).toBe("ineligible");
    expect(evaluateSponsor({ ...full, isParentOfCandidate: true }, 16).issues[0]).toMatch(/parent/);
    expect(evaluateSponsor({ ...full, marriageRegular: 0 }, 16).eligibility).toBe("ineligible");
  });
  it("reads sponsor facts from a census record without inventing certainty", () => {
    const f = sponsorFactsFromCensus({ fullName: "A B", dobYear: 1990, baptisedStatus: "baptised_here", confirmationStatus: "unknown", communionStatus: "received_here", practisingStatus: "unknown", maritalStatus: "civil_only" }, 2026);
    expect(f).toMatchObject({ sponsorAge: 36, isCatholic: 1, isConfirmed: null, hasReceivedEucharist: 1, isPractising: null, marriageRegular: 0 });
  });
  it("lists every readiness blocker", () => {
    const c = { program: "confirmation", stage: null, candidateStatus: "active", interviewResult: "pending", baptismId: null, baptismPlace: null };
    const b = readiness(c, { percent: 60 }, 75, 0);
    expect(b).toHaveLength(4);
    expect(readiness({ ...c, interviewResult: "passed", baptismId: 3 }, { percent: 80 }, 75, 1)).toEqual([]);
    expect(readiness({ ...c, interviewResult: "passed", baptismId: 3 }, { percent: null }, 75, 1)).toEqual(["No attendance has been recorded."]);
    expect(readiness({ program: "rcia", stage: "catechumenate", candidateStatus: "active", interviewResult: "passed", baptismId: null, baptismPlace: null }, { percent: 90 }, 75, 0).join()).toMatch(/Sacraments/);
  });
  it("plans which sacraments to record", () => {
    const none = { withBaptism: false, withConfirmation: false, withCommunion: false };
    expect(promotionPlan("baptism_child", false, none)).toEqual({ baptism: true, confirmation: false, communion: false });
    expect(promotionPlan("rcia", true, { withBaptism: true, withConfirmation: true, withCommunion: true })).toEqual({ baptism: false, confirmation: true, communion: true });
    expect(promotionPlan("rcia", false, none)).toEqual({ baptism: false, confirmation: false, communion: false });
  });
  it("computes attendance percent", () => { expect(attendancePercent(0, 0)).toBeNull(); expect(attendancePercent(8, 6)).toBe(75); });
});

import { levyFor, validPercent } from "@/lib/levy/rules";
describe("levy", () => {
  it("defaults a blank percent to 100% and reports owing / settled / overpaid", () => {
    expect(levyFor({ collected: 1000, percent: null, remitted: 400 })).toEqual({ due: 1000, balance: 600, state: "owing" });
    expect(levyFor({ collected: 1000, percent: 25, remitted: 250 })).toEqual({ due: 250, balance: 0, state: "settled" });
    expect(levyFor({ collected: 100, percent: 10, remitted: 12 }).state).toBe("overpaid");
    expect(levyFor({ collected: 0.3, percent: 100, remitted: 0.1 }).balance).toBe(0.2);   // no float drift
  });
  it("validates percentages", () => {
    expect(validPercent("")).toEqual({ ok: true, value: null });
    expect(validPercent("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(validPercent("101")).toEqual({ ok: false });
    expect(validPercent("abc")).toEqual({ ok: false });
    expect(validPercent("-5")).toEqual({ ok: false });
  });
});

import { LiturgicalCalendar, adventStart, easter, weekStart } from "@/lib/liturgy/calendar";
describe("liturgical calendar", () => {
  it("computes Easter and Advent correctly", () => {
    expect(easter(2025)).toBe("2025-04-20"); expect(easter(2026)).toBe("2026-04-05"); expect(easter(2027)).toBe("2027-03-28"); expect(easter(2024)).toBe("2024-03-31");
    expect(adventStart(2026)).toBe("2026-11-29"); expect(adventStart(2027)).toBe("2027-11-28");
  });
  const cal = new LiturgicalCalendar([
    { month: 12, day: 25, name: "The Nativity of the Lord (Christmas)", rank: "solemnity", colour: "white", hdo: true },
    { month: 11, day: 1, name: "All Saints", rank: "solemnity", colour: "white", hdo: true },
    { month: 3, day: 19, name: "Saint Joseph", rank: "solemnity", colour: "white", hdo: false },
    { month: 10, day: 7, name: "Our Lady of the Rosary", rank: "memorial", colour: "white", hdo: false },
  ]);
  it("names Sundays by season", () => {
    expect(cal.forDate("2026-11-29").name).toBe("1st Sunday of Advent");
    expect(cal.forDate("2026-03-01").name).toBe("2nd Sunday of Lent");
    expect(cal.forDate("2026-04-12").name).toContain("Divine Mercy");
    expect(cal.forDate("2026-11-22").name).toContain("King of the Universe");
    expect(cal.forDate("2026-10-25").name).toBe("30th Sunday in Ordinary Time");
    expect(cal.forDate("2026-10-25")).toMatchObject({ season: "Ordinary Time", colour: "green", isSunday: true, holyDayOfObligation: true });
  });
  it("places the moveable feasts from Easter", () => {
    expect(cal.forDate("2026-02-18").name).toBe("Ash Wednesday"); expect(cal.forDate("2026-04-03").name).toContain("Good Friday");
    expect(cal.forDate("2026-05-24").name).toBe("Pentecost Sunday"); expect(cal.forDate("2026-05-14").name).toBe("Ascension of the Lord");
    expect(new LiturgicalCalendar([], { ascensionOnSunday: true, corpusChristiOnSunday: true, epiphanyOnSunday: true }).forDate("2026-05-17").name).toBe("Ascension of the Lord");
  });
  it("lets a fixed solemnity outrank an ordinary-time weekday/Sunday and records what it displaced", () => {
    expect(cal.forDate("2026-11-01")).toMatchObject({ name: "All Saints", holyDayOfObligation: true });   // a Sunday in 2026
    expect(cal.forDate("2026-11-01").also.join()).toMatch(/Sunday in Ordinary Time/);
    expect(cal.forDate("2026-10-07").name).toBe("Our Lady of the Rosary");
    expect(cal.forDate("2026-10-08").name).toBe("Weekday in Ordinary Time");
  });
  it("applies the Epiphany switch", () => {
    expect(cal.epiphany(2026)).toBe("2026-01-04");
    expect(new LiturgicalCalendar([], { ascensionOnSunday: false, corpusChristiOnSunday: true, epiphanyOnSunday: false }).epiphany(2026)).toBe("2026-01-06");
    expect(cal.baptismOfTheLord(2026)).toBe("2026-01-11");
  });
  it("finds the Sunday that starts a week", () => { expect(weekStart("2026-10-24")).toBe("2026-10-18"); expect(weekStart("2026-10-25")).toBe("2026-10-25"); });
});
