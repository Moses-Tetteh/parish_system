import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";

/** Summary cards above a register list (PHP: index_header hooks). Counts only; no personal details. */
function Cards({ cards }: { cards: [value: string | number, label: string, tone?: "ok" | "warn" | "bad"][] }) {
  const color = { ok: "var(--success)", warn: "#8a6100", bad: "var(--danger)" } as const;
  return (
    <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 16 }}>
      {cards.map(([v, l, tone], i) => (
        <div className="stat-card" key={i}><div className="stat-count" style={tone ? { color: color[tone] } : undefined}>{v}</div><div className="stat-label">{l}</div></div>
      ))}
    </div>
  );
}
const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

export async function IndexHeader({ registerKey, user }: { registerKey: string; user: SessionUser }) {
  const d = db();
  if (registerKey === "sick_calls") {
    const S = schema.sickCalls, active = eq(S.isArchived, 0);
    const [month, year, due] = await Promise.all([
      count(d.select({ n: sql<number>`count(*)` }).from(S).where(and(active, sql`${S.visitDate} >= date_trunc('month', current_date)`))),
      count(d.select({ n: sql<number>`count(*)` }).from(S).where(and(active, sql`extract(year from ${S.visitDate}) = extract(year from current_date)`))),
      count(d.select({ n: sql<number>`count(*)` }).from(S).where(and(active, sql`${S.followUpDate} is not null and ${S.followUpDate} <= current_date`))),
    ]);
    return <Cards cards={[[month, "Visits this month"], [year, "Visits this year"], [due, "Follow-ups due", due ? "warn" : undefined]]} />;
  }
  if (registerKey === "candidates") {
    const C = schema.sacramentCandidates, live = and(eq(C.isArchived, 0), eq(C.candidateStatus, "active"));
    const [active, ready, promoted] = await Promise.all([
      count(d.select({ n: sql<number>`count(*)` }).from(C).where(live)),
      count(d.select({ n: sql<number>`count(*)` }).from(C).where(and(live, eq(C.interviewResult, "passed")))),
      count(d.select({ n: sql<number>`count(*)` }).from(C).where(and(eq(C.isArchived, 0), eq(C.candidateStatus, "promoted"), sql`extract(year from ${C.promotedOn}) = extract(year from current_date)`))),
    ]);
    return (<><Cards cards={[[active, "Active candidates"], [ready, "Interview passed", "ok"], [promoted, "Entered in registers this year", "ok"]]} /><p><Link className="btn btn-secondary" href="/candidates/attendance">📋 Take class attendance</Link></p></>);
  }
  if (registerKey === "parishioners") {
    const P = schema.parishioners, resident = and(eq(P.isArchived, 0), eq(P.residencyStatus, "resident"));
    const [res, prac, irregular] = await Promise.all([
      count(d.select({ n: sql<number>`count(*)` }).from(P).where(resident)),
      count(d.select({ n: sql<number>`count(*)` }).from(P).where(and(resident, eq(P.practisingStatus, "practising")))),
      roleCan(user.role, "sensitive.irregular") ? count(d.select({ n: sql<number>`count(*)` }).from(P).where(and(resident, sql`${P.maritalStatus} in ('married_customary','civil_only','divorced_remarried')`))) : Promise.resolve(null),
    ]);
    const cards: [number, string, ("ok" | "warn")?][] = [[res, "Resident parishioners"], [prac, "Practising", "ok"]];
    if (irregular !== null) cards.push([irregular, "Marriages to regularise", irregular ? "warn" : undefined]);
    return <Cards cards={cards} />;
  }
  return null;
}

/** Extra buttons on a register row (PHP: row_actions hooks). */
export function RowActions({ registerKey, id }: { registerKey: string; id: number }) {
  if (registerKey === "societies") return <Link className="btn btn-small btn-secondary" href={`/societies/${id}`}>Members &amp; Dues</Link>;
  return null;
}
