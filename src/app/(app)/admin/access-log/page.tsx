import { desc, eq, and } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { PAGE_SIZE } from "@/lib/registers/repository";

export const metadata = { title: "Access Log" };
export const dynamic = "force-dynamic";

export default async function AccessLogPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requirePermission("access_log.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const action = (sp.action ?? "").slice(0, 20);
  const rows = await db().select().from(schema.accessLog).where(and(action ? eq(schema.accessLog.action, action) : undefined))
    .orderBy(desc(schema.accessLog.id)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(action && { action }), page: String(p) })}`;

  return (
    <>
      <h1>Access Log</h1>
      <p className="hint" style={{ marginTop: 0, marginBottom: 18 }}>Sign-ins, failed sign-ins, views of sensitive registers and exports. Review monthly; investigate any export you do not recognise.</p>

      <div className="card">
        <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label htmlFor="a">Action</label>
            <select id="a" name="action" defaultValue={action}>
              <option value="">All</option>
              {["login", "login_failed", "login_blocked", "logout", "view", "export"].map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <button className="btn" type="submit">Filter</button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">When</th><th scope="col">User</th><th scope="col">Role</th><th scope="col">Action</th><th scope="col">Resource</th><th scope="col">IP</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>No entries found.</td></tr>}
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{r.occurredAt}</td><td>{r.username}</td><td>{r.role}</td><td>{r.action}</td>
                <td>{r.resource}{r.recordId ? ` #${r.recordId}` : ""} {r.detail}</td><td>{r.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="pager" aria-label="Pages">
        {page > 1 && <Link href={qs(page - 1)}>← Newer</Link>}
        <Link href={qs(page)} className="current" aria-current="page">{page}</Link>
        {rows.length > PAGE_SIZE && <Link href={qs(page + 1)}>Older →</Link>}
      </nav>
    </>
  );
}
