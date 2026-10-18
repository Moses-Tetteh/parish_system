import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { allRegisters } from "@/lib/registers/registry";
import { listRecords } from "@/lib/registers/repository";
import { displayValue } from "@/lib/registers/view";

export const metadata = { title: "Search All" };
export const dynamic = "force-dynamic";

const SEARCHABLE = ["baptism", "communion", "confirmation", "death", "parishioners", "holy_orders"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("registers");
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);

  const defs = allRegisters().filter((d) => SEARCHABLE.includes(d.key) && roleCan(user.role, d.permission));
  const results = q.length >= 2
    ? await Promise.all(defs.map(async (d) => ({ d, res: await listRecords(d, user, { q, page: 1 }) })))
    : [];
  const hits = results.filter((r) => r.res.total);

  return (
    <>
      <h1>Search All Registers</h1>
      <p className="hint">Search once by name to see every matching record across Baptism, First Communion, Confirmation, Death, Holy Orders and Parishioners — handy when a parishioner needs a lost baptismal card replaced or you need their full sacramental history in one place.</p>

      <form method="get" className="toolbar" style={{ marginBottom: 20 }}>
        <label htmlFor="q" className="sr-only">Name or record number</label>
        <input id="q" type="text" name="q" defaultValue={q} placeholder="Enter a name or record number (min. 2 letters)…" maxLength={100} style={{ maxWidth: 360 }} autoFocus />
        <button className="btn" type="submit">Search</button>
      </form>

      {q.length < 2 && <p className="hint">Enter a name above to search all registers at once.</p>}
      {q.length >= 2 && hits.length === 0 && <div className="flash flash-info">No records found for “{q}” in any register.</div>}

      {hits.map(({ d, res }) => {
        const first = d.fields.find((f) => f.key === d.listColumns[0])!;
        const second = d.fields.find((f) => f.key === d.listColumns[1]);
        return (
          <div className="card" key={d.key}>
            <h2>{d.title} <span className="badge">{res.total}</span></h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">{first.label}</th>{second && <th scope="col">{second.label}</th>}<th scope="col">Actions</th></tr></thead>
                <tbody>
                  {res.rows.slice(0, 8).map((r) => (
                    <tr key={r.id}>
                      <td>{displayValue(d, first, r) || `#${r.id}`}</td>
                      {second && <td>{displayValue(d, second, r)}</td>}
                      <td className="row-actions"><Link href={`/registers/${d.key}/${r.id}`} className="btn btn-small">View / Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {res.total > 8 && <p className="hint">Showing 8 of {res.total}. <Link href={`/registers/${d.key}?q=${encodeURIComponent(q)}`}>See all {res.total} →</Link></p>}
          </div>
        );
      })}
    </>
  );
}
