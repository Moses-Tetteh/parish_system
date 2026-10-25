import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { listDuplicatePairs } from "@/lib/parishioners/tools";
import type { Row } from "@/lib/parishioners/merger";
import type { SP } from "@/lib/forms";
import { dismissAction, mergeAction, mergeAllAction } from "../actions";

export const metadata = { title: "Possible Duplicates" };
export const dynamic = "force-dynamic";
const TIER = { same_parents: { label: "Same parents — very likely the same person", color: "var(--success)" }, likely: { label: "Likely the same person", color: "#8a6100" }, name_only: { label: "Same name only — check carefully", color: "var(--danger)" } } as const;

function Person({ r }: { r: Row }) {
  const bits = [r.date_of_birth_year && `b. ${r.date_of_birth_year}`, r.father_name && `father: ${r.father_name}`, r.mother_name && `mother: ${r.mother_name}`, r.residence].filter(Boolean).join(" · ");
  return <div><strong>{String(r.full_name)}</strong> <span className="muted">#{String(r.id)}</span><br /><span className="muted">{bits || "no other details recorded"}</span></div>;
}

export default async function Duplicates({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const pairs = await listDuplicatePairs(user, 300);
  const certain = pairs.filter((p) => p.auto).length;
  return (
    <>
      <h1>Possible Duplicates</h1>
      <Notice sp={sp} />
      <p className="hint">People who may appear twice on the parishioners list. Merging keeps the fuller record, brings across anything only the other one has, and archives the duplicate — register entries, society memberships and rota entries move to the survivor. Nothing is ever merged without an explicit click, except “Merge all certain” which only touches pairs with matching father and mother.</p>
      <div className="toolbar">
        <Link href="/registers/parishioners" className="btn btn-secondary">← Parishioners</Link>
        {certain > 0 && <form action={mergeAllAction}><button className="btn" type="submit">Merge all certain ({certain})</button></form>}
      </div>
      {pairs.length === 0 && <div className="empty-state">✅ No possible duplicates found.</div>}
      {pairs.map((p) => (
        <div className="card" key={`${p.a.id}-${p.b.id}`}>
          <div style={{ color: TIER[p.tier].color, fontWeight: 600 }}>{TIER[p.tier].label}</div>
          <p className="muted">{p.reasons.join(" · ")}</p>
          {p.blocker && <div className="callout callout-warning">Cannot be merged yet: {p.blocker}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, margin: "10px 0" }}><Person r={p.a} /><Person r={p.b} /></div>
          <div className="toolbar">
            {!p.blocker && (
              <form action={mergeAction} className="inline-form">
                <input type="hidden" name="a" value={String(p.a.id)} /><input type="hidden" name="b" value={String(p.b.id)} />
                <label htmlFor={`k${p.a.id}-${p.b.id}`}>Keep </label>
                <select id={`k${p.a.id}-${p.b.id}`} name="keep" defaultValue={String(p.keep.id)}>
                  <option value={String(p.a.id)}>{String(p.a.full_name)} (#{String(p.a.id)})</option><option value={String(p.b.id)}>{String(p.b.full_name)} (#{String(p.b.id)})</option>
                </select>
                <button className="btn btn-small" type="submit">Merge</button>
              </form>
            )}
            <form action={dismissAction}><input type="hidden" name="a" value={String(p.a.id)} /><input type="hidden" name="b" value={String(p.b.id)} /><button className="btn btn-small btn-secondary" type="submit">Different people</button></form>
            <Link className="btn btn-small btn-secondary" href={`/registers/parishioners/${p.a.id}`}>Open #{String(p.a.id)}</Link>
            <Link className="btn btn-small btn-secondary" href={`/registers/parishioners/${p.b.id}`}>Open #{String(p.b.id)}</Link>
          </div>
        </div>
      ))}
    </>
  );
}
