import { desc, eq, and, like } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { PAGE_SIZE } from "@/lib/registers/repository";

export const metadata = { title: "Audit Trail" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; user?: string; page?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const table = (sp.table ?? "").slice(0, 50), user = (sp.user ?? "").slice(0, 100);
  const where = and(table ? eq(schema.auditLog.tableName, table) : undefined, user ? like(schema.auditLog.username, `%${user.replace(/[\\%_]/g, "\\$&")}%`) : undefined);
  const rows = await db().select().from(schema.auditLog).where(where).orderBy(desc(schema.auditLog.id)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(table && { table }), ...(user && { user }), page: String(p) })}`;

  return (
    <>
      <h1>Audit Trail</h1>
      <p className="hint" style={{ marginTop: 0, marginBottom: 18 }}>Who created, changed, archived or deleted what, and when.</p>

      <div className="card">
        <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}><label htmlFor="t">Table</label><input id="t" type="text" name="table" defaultValue={table} /></div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}><label htmlFor="u">User</label><input id="u" type="text" name="user" defaultValue={user} /></div>
          <button className="btn" type="submit">Filter</button>
          {(table || user) && <Link href="/admin/audit" className="btn btn-secondary">Reset</Link>}
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">When</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Table #id</th><th scope="col">Details</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5}>No entries found.</td></tr>}
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{r.timestamp}</td><td>{r.username}</td><td>{r.action}</td>
                <td className="nowrap">{r.tableName} #{r.recordId}</td>
                <td>{r.details ? <div className="audit-detail mono">{r.details}</div> : null}</td>
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
