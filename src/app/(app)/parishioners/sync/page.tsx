import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { runFullSync } from "@/lib/parishioners/sync";
import type { SP } from "@/lib/forms";
import { syncApplyAction } from "../actions";

export const metadata = { title: "Sync from Registers" };
export const dynamic = "force-dynamic";

export default async function SyncPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  let preview: Awaited<ReturnType<typeof runFullSync>> | null = null;
  try { preview = await runFullSync(user.username, false); } catch (e) { console.error("sync preview failed", e); }
  const nothing = preview && !preview.created && !preview.linked && !preview.updated;
  const Stat = ({ n, l, warn }: { n: number; l: string; warn?: boolean }) => <div className="stat-card"><div className="stat-count" style={warn && n ? { color: "var(--danger)" } : undefined}>{n}</div><div className="stat-label">{l}</div></div>;
  return (
    <>
      <h1>Sync from the sacrament registers</h1>
      <Notice sp={sp} />
      <p className="hint">Adds everyone in the Baptism, First Communion, Confirmation, Holy Matrimony and Holy Orders registers to the parishioners list. Needed only after bulk changes made outside the app (a database restore or import): saving an entry in a register already updates the list. The preview runs the real job and rolls it back, so what you see is exactly what you get.</p>
      {!preview ? <div className="callout callout-warning">The preview could not run. Please try again, or tell the administrator.</div> : (
        <div className="card">
          <h2>What would change</h2>
          <div className="stat-grid">
            <Stat n={preview.created} l="people to add" /><Stat n={preview.linked} l="existing people to link to a register entry" /><Stat n={preview.updated} l="existing people to complete" /><Stat n={preview.flagged} l="to flag for a check" warn />
          </div>
          {nothing ? <p className="empty-state">✅ The list is already up to date with the registers. Nothing to do.</p> : (
            <>
              {preview.notes.length > 0 && <details open><summary>First {Math.min(preview.notes.length, 25)} changes</summary><ul className="plain-list">{preview.notes.slice(0, 25).map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
              <p className="hint">Nothing already on the list is overwritten — only blank details are filled in. When a name could belong to more than one person, a separate entry is added and flagged <em>Needs review</em> instead of guessing.</p>
              <form action={syncApplyAction}><button className="btn" type="submit">Apply these changes</button> <Link className="btn btn-secondary" href="/registers/parishioners">Cancel</Link></form>
            </>
          )}
          {preview.errors > 0 && <div className="callout callout-warning"><strong>{preview.errors} register entries could not be processed:</strong><ul className="plain-list">{preview.errorSamples.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
        </div>
      )}
      <p><Link className="btn btn-secondary" href="/registers/parishioners">← Back to the list</Link></p>
    </>
  );
}
