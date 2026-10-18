import { desc, eq, and, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { PAGE_SIZE } from "@/lib/registers/repository";
import Link from "next/link";

export const metadata = { title: "Audit trail" };
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit trail</h1>
      <form className="card flex flex-wrap gap-3">
        <div><label className="label" htmlFor="t">Table</label><input id="t" name="table" defaultValue={table} className="input" /></div>
        <div><label className="label" htmlFor="u">User</label><input id="u" name="user" defaultValue={user} className="input" /></div>
        <div className="self-end"><button className="btn-primary">Filter</button></div>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Table #id</th><th className="px-3 py-2">Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap px-3 py-2">{r.timestamp}</td><td className="px-3 py-2">{r.username}</td><td className="px-3 py-2">{r.action}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.tableName} #{r.recordId}</td><td className="max-w-md truncate px-3 py-2 font-mono text-xs" title={r.details ?? ""}>{r.details}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex justify-between">
        {page > 1 ? <Link className="btn-secondary" href={qs(page - 1)}>← Newer</Link> : <span />}
        {rows.length > PAGE_SIZE ? <Link className="btn-secondary" href={qs(page + 1)}>Older →</Link> : <span />}
      </nav>
    </div>
  );
}
