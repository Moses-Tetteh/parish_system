import { desc, eq, and } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { PAGE_SIZE } from "@/lib/registers/repository";

export const metadata = { title: "Access log" };
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Access log</h1>
      <p className="text-sm text-slate-600">Sign-ins, failed sign-ins, views of sensitive registers and exports. Review monthly; investigate any export you do not recognise.</p>
      <form className="card flex gap-3">
        <div><label className="label" htmlFor="a">Action</label>
          <select id="a" name="action" defaultValue={action} className="input"><option value="">All</option>{["login", "login_failed", "login_blocked", "logout", "view", "export"].map((a) => <option key={a}>{a}</option>)}</select></div>
        <div className="self-end"><button className="btn-primary">Filter</button></div>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Resource</th><th className="px-3 py-2">IP</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap px-3 py-2">{r.occurredAt}</td><td className="px-3 py-2">{r.username}</td><td className="px-3 py-2">{r.role}</td><td className="px-3 py-2">{r.action}</td><td className="px-3 py-2">{r.resource}{r.recordId ? ` #${r.recordId}` : ""} {r.detail}</td><td className="px-3 py-2">{r.ipAddress}</td></tr>
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
