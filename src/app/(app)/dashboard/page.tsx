import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { allRegisters, resolveTable } from "@/lib/registers/registry";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const DASHBOARD_KEYS = ["baptism", "communion", "confirmation", "death", "parishioners", "mass_intentions"];

export default async function Dashboard() {
  const user = await requireUser();

  if (user.role === "ppc_secretary") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Welcome, {user.fullName || user.username}</h1>
        <p className="card text-slate-700">The Members &amp; Dues area for the PPC Secretary is part of the financial module (see MIGRATION.md, phase 2).</p>
      </div>
    );
  }

  const defs = allRegisters().filter((d) => DASHBOARD_KEYS.includes(d.key) && roleCan(user.role, d.permission));
  // One COUNT per register, run in parallel; a failure in one tile never blanks the page.
  const counts = await Promise.all(defs.map(async (d) => {
    try {
      const t = resolveTable(d.table);
      const [row] = await db().select({ n: sql<number>`count(*)` }).from(t.table).where(and(eq(t.columns.get("is_archived")!.col, 0)));
      return Number(row?.n ?? 0);
    } catch (e) { console.error("dashboard count failed", d.key, e); return null; }
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user.fullName || user.username}</h1>
        <p className="text-slate-600">An overview of the parish registers.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {defs.map((d, i) => (
          <Link key={d.key} href={`/registers/${d.key}`} className="card block transition hover:border-brand-600">
            <div className="text-3xl font-bold text-brand-700">{counts[i] ?? "—"}</div>
            <div className="mt-1 text-sm text-slate-600">{d.title}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
