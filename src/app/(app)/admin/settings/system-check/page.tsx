import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { systemCheck } from "@/lib/settings-admin/repository";

export const metadata = { title: "System Check" };
export const dynamic = "force-dynamic";

export default async function SystemCheck() {
  const user = await requirePermission("settings.manage");
  const c = await systemCheck(user);
  return (
    <>
      <h1>System Check</h1>
      <p className="hint">Confirms the database contains every table the parish modules need. It changes nothing: if something is missing, run <code>npm run db:migrate</code> against the database (migrations only ever add; they never delete records).</p>
      {c.missing === 0 ? <div className="callout callout-info">✅ Everything is in place ({c.tables.length} tables).</div> : <div className="callout callout-warning">⚠ <strong>{c.missing}</strong> table(s) are missing, so some pages cannot work. Run the migrations.</div>}
      <div className="card"><h3>Tables</h3><ul className="plain-list">{c.tables.map(([t, ok]) => <li key={t}>{ok ? "✔" : <strong style={{ color: "var(--danger)" }}>✘</strong>} {t}</li>)}</ul></div>
      <div className="card"><h3>Applied migrations</h3>{c.migrations.length ? <ul className="plain-list">{c.migrations.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="muted">Not available.</p>}</div>
      <p><Link href="/admin/settings" className="btn btn-secondary">← Settings</Link></p>
    </>
  );
}
