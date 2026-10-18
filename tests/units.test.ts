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
