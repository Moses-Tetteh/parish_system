import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAccess } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { buildAnnualReport, type AnnualReport } from "./annual";

const S = schema.annualReportSnapshots;

/** A frozen copy: later edits to the registers never change it. Includes finance (the snapshot is for the priest's records). */
export async function saveSnapshot(u: SessionUser, year: number): Promise<number> {
  if (!roleCan(u.role, "reports.snapshot")) throw new Error("forbidden");
  const report = await buildAnnualReport(year, true);
  const [row] = await db().insert(S).values({ reportYear: year, dataJson: JSON.stringify(report), savedBy: u.username }).returning({ id: S.id });
  await logAccess({ username: u.username, role: u.role, action: "create", resource: "annual_report", detail: `snapshot ${year}` });
  return row!.id;
}

export async function listSnapshots(year: number) {
  return db().select({ id: S.id, savedAt: S.savedAt, savedBy: S.savedBy }).from(S).where(eq(S.reportYear, year)).orderBy(desc(S.savedAt)).limit(20);
}

export async function loadSnapshot(id: number, includeFinance: boolean): Promise<AnnualReport | null> {
  const [r] = await db().select().from(S).where(eq(S.id, id)).limit(1);
  if (!r) return null;
  try {
    const rep = JSON.parse(r.dataJson) as AnnualReport;
    rep.year = r.reportYear;
    if (!includeFinance) rep.sections = rep.sections.filter((s) => !s.title.startsWith("Finances")); // a role without finance access never sees it in a stored copy either
    return rep;
  } catch { return null; }
}
