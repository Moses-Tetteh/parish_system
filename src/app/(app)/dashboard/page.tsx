import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { allRegisters, resolveTable } from "@/lib/registers/registry";
import { MARRIAGE_DEF } from "@/lib/matrimony/fields";
import { NavIcon, RosaryDivider, SacIcon } from "@/components/icons";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Same tiles, labels and order as the PHP dashboard (sacraments first, then rosters). Matrimony,
 *  Households and Announcements join them as those modules are ported. */
const TILES: { key: string; label: string; sac?: string; nav?: string }[] = [
  { key: "baptism", label: "Baptism", sac: "baptism" },
  { key: "communion", label: "First Communion", sac: "communion" },
  { key: "confirmation", label: "Confirmation", sac: "confirmation" },
  { key: "matrimony", label: "Holy Matrimony", sac: "matrimony" },
  { key: "death", label: "Death", sac: "death" },
  { key: "parish_priests", label: "Parish Priests", nav: "user" },
  { key: "holy_orders", label: "Holy Orders", nav: "book" },
  { key: "catechesis_teachers", label: "Catechist", nav: "users" },
  { key: "counsellors", label: "Marriage Counsellors", nav: "message" },
  { key: "parishioners", label: "Parishioners", nav: "users" },
];

export default async function Dashboard() {
  const user = await requireUser();
  const name = user.fullName || user.username;

  if (user.role === "ppc_secretary") {
    return (
      <>
        <div className="hero">
          <div className="eyebrow">Welcome, {name}</div>
          <h1>PPC Secretary Dashboard</h1>
          <p>The Members &amp; Dues area is part of the financial module, which is still being ported (see MIGRATION.md, phase 2).</p>
        </div>
      </>
    );
  }

  const defs = new Map(allRegisters().map((d) => [d.key, d]));
  defs.set(MARRIAGE_DEF.key, MARRIAGE_DEF); // Holy Matrimony has its own pages but counts like any register
  const tiles = TILES.filter((t) => { const d = defs.get(t.key); return d && roleCan(user.role, d.permission); });

  // One COUNT per register, in parallel; a failure in one tile shows "—" and never blanks the page.
  const counts = await Promise.all(tiles.map(async (t) => {
    try {
      const r = resolveTable(defs.get(t.key)!.table);
      const archived = r.columns.get("is_archived");
      const [row] = await db().select({ n: sql<number>`count(*)` }).from(r.table).where(archived ? and(eq(archived.col, 0)) : undefined);
      return Number(row?.n ?? 0);
    } catch (e) { console.error("dashboard count failed", t.key, e); return null; }
  }));

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Welcome, {name}</div>
        <h1>Sacraments Register Dashboard</h1>
        <p>An overview of the parish&rsquo;s registers and rosters.</p>
      </div>

      <h2 style={{ marginBottom: 14 }}>Register Totals</h2>
      <div className="stat-grid">
        {tiles.map((t, i) => (
          <div className="stat-card" key={t.key}>
            <div className="stat-icon">{t.sac ? <SacIcon name={t.sac} size={26} /> : <NavIcon name={t.nav ?? "circle"} size={16} />}</div>
            <div className="stat-count">{counts[i] ?? "—"}</div>
            <div className="stat-label">{t.label}</div>
          </div>
        ))}
      </div>

      <RosaryDivider count={11} style={{ margin: "30px 0" }} />
    </>
  );
}
