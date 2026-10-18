import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { allRegisters } from "@/lib/registers/registry";
import { listRecords } from "@/lib/registers/repository";
import { displayValue } from "@/lib/registers/view";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const SEARCHABLE = ["baptism", "communion", "confirmation", "death", "parishioners", "burial_records", "holy_orders"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("registers");
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);

  const defs = allRegisters().filter((d) => SEARCHABLE.includes(d.key) && roleCan(user.role, d.permission));
  const results = q.length >= 2
    ? await Promise.all(defs.map(async (d) => ({ d, res: await listRecords(d, user, { q, page: 1 }) })))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Search all registers</h1>
      <form method="get" className="flex gap-2">
        <label htmlFor="q" className="sr-only">Name or record number</label>
        <input id="q" name="q" defaultValue={q} className="input" placeholder="Name or record number (min. 2 letters)" maxLength={100} autoFocus />
        <button className="btn-primary">Search</button>
      </form>
      {q.length >= 2 && !results.some((r) => r.res.total) && <p className="card text-slate-600">No matches for “{q}”.</p>}
      {results.filter((r) => r.res.total).map(({ d, res }) => (
        <section key={d.key} className="card">
          <h2 className="font-semibold">{d.title} <span className="text-sm font-normal text-slate-500">({res.total})</span></h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {res.rows.slice(0, 8).map((r) => {
              const first = d.fields.find((f) => f.key === d.listColumns[0])!;
              const second = d.fields.find((f) => f.key === d.listColumns[1]);
              return (
                <li key={r.id} className="py-2">
                  <Link className="font-medium text-brand-700 hover:underline" href={`/registers/${d.key}/${r.id}`}>{displayValue(d, first, r) || `#${r.id}`}</Link>
                  {second && <span className="ml-2 text-sm text-slate-500">{displayValue(d, second, r)}</span>}
                </li>
              );
            })}
          </ul>
          {res.total > 8 && <Link className="mt-2 inline-block text-sm text-brand-700 hover:underline" href={`/registers/${d.key}?q=${encodeURIComponent(q)}`}>See all {res.total} →</Link>}
        </section>
      ))}
    </div>
  );
}
