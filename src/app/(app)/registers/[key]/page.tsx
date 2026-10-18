import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { getRegister } from "@/lib/registers/registry";
import { PAGE_SIZE, listRecords } from "@/lib/registers/repository";
import { displayValue } from "@/lib/registers/view";
import { isValidIsoDate } from "@/lib/dates";
import { archiveAction, deleteAction } from "./actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RegisterList({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SP> }) {
  const { key } = await params;
  const def = getRegister(key);
  if (!def) notFound();
  const user = await requirePermission(def.permission);
  const sp = await searchParams;

  const archived = one(sp.archived) === "1";
  const from = one(sp.from), to = one(sp.to);
  const filters = Object.fromEntries((def.filters ?? []).map((f) => [f, one(sp[f])]));
  const serving = one(sp.serving) === "serving" ? "serving" : one(sp.serving) === "past" ? "past" : "";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const q = one(sp.q).slice(0, 100);

  const { rows, total } = await listRecords(def, user, {
    q, filters, archived, page, serving,
    from: isValidIsoDate(from) ? from : undefined, to: isValidIsoDate(to) ? to : undefined,
  });

  const cols = def.listColumns.map((c) => def.fields.find((f) => f.key === c)).filter((f): f is NonNullable<typeof f> => !!f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canDelete = !!def.allowDelete && !!def.deleteRoles?.includes(user.role);
  const canExport = def.export !== false && roleCan(user.role, "export");

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { q, archived: archived ? "1" : "", from, to, serving, ...filters };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{def.title}{archived && <span className="ml-2 text-base font-normal text-slate-500">(archived)</span>}</h1>
        <div className="ml-auto flex gap-2">
          {canExport && <a className="btn-secondary" href={`/registers/${key}/export${qs({})}`}>Export CSV</a>}
          <Link className="btn-primary" href={`/registers/${key}/new`}>+ Add {def.label}</Link>
        </div>
      </div>
      {def.intro && <p className="rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-900">{def.intro}</p>}
      {one(sp.saved) && <p role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-900">Saved.</p>}
      {one(sp.deleted) && <p role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-900">Record deleted.</p>}

      <form method="get" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="label">Search</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Name or record number" maxLength={100} />
        </div>
        {(def.filters ?? []).map((fk) => {
          const f = def.fields.find((x) => x.key === fk);
          if (!f?.options) return null;
          return (
            <div key={fk}>
              <label htmlFor={`f_${fk}`} className="label">{f.label}</label>
              <select id={`f_${fk}`} name={fk} defaultValue={filters[fk]} className="input">
                <option value="">All</option>
                {Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          );
        })}
        {def.serviceStatusField && (
          <div>
            <label htmlFor="serving" className="label">Status</label>
            <select id="serving" name="serving" defaultValue={serving} className="input">
              <option value="">All</option><option value="serving">Serving</option><option value="past">Past</option>
            </select>
          </div>
        )}
        {def.dateFilter && (<>
          <div><label htmlFor="from" className="label">From</label><input id="from" type="date" name="from" defaultValue={from} className="input" /></div>
          <div><label htmlFor="to" className="label">To</label><input id="to" type="date" name="to" defaultValue={to} className="input" /></div>
        </>)}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <label className="mr-auto flex items-center gap-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={archived} className="h-5 w-5" /> Show archived</label>
          <button className="btn-primary">Apply</button>
          <Link href={`/registers/${key}`} className="btn-secondary">Reset</Link>
        </div>
      </form>

      <p className="text-sm text-slate-600" aria-live="polite">{total.toLocaleString()} record{total === 1 ? "" : "s"}</p>

      {/* Desktop: table. Phone: stacked cards — same data, no horizontal scrolling. */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>{cols.map((c) => <th key={c.key} scope="col" className="px-4 py-3">{c.label.replace(/\s*\(.*?\)/, "")}</th>)}<th scope="col" className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {cols.map((c, i) => (
                  <td key={c.key} className="px-4 py-3">
                    {i === 0 ? <Link href={`/registers/${key}/${r.id}`} className="font-medium text-brand-700 underline-offset-2 hover:underline">{displayValue(def, c, r) || "—"}</Link> : displayValue(def, c, r)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right"><RowActions k={key} id={r.id} archived={archived} canDelete={canDelete} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols.length + 1} className="px-4 py-10 text-center text-slate-500">No records found.</td></tr>}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="card">
            <Link href={`/registers/${key}/${r.id}`} className="text-base font-semibold text-brand-700">{displayValue(def, cols[0]!, r) || "—"}</Link>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {cols.slice(1).map((c) => (<div key={c.key}><dt className="text-xs text-slate-500">{c.label.replace(/\s*\(.*?\)/, "")}</dt><dd>{displayValue(def, c, r) || "—"}</dd></div>))}
            </dl>
            <div className="mt-3"><RowActions k={key} id={r.id} archived={archived} canDelete={canDelete} /></div>
          </li>
        ))}
        {!rows.length && <li className="card text-center text-slate-500">No records found.</li>}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? <Link className="btn-secondary" href={`/registers/${key}${qs({ page: String(page - 1) })}`}>← Previous</Link> : <span />}
          <span className="text-sm text-slate-600">Page {page} of {pages}</span>
          {page < pages ? <Link className="btn-secondary" href={`/registers/${key}${qs({ page: String(page + 1) })}`}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

function RowActions({ k, id, archived, canDelete }: { k: string; id: number; archived: boolean; canDelete: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Link href={`/registers/${k}/${id}`} className="btn-secondary !min-h-9 !px-3">Edit</Link>
      <form action={archiveAction.bind(null, k, id, !archived)}><button className="btn-secondary !min-h-9 !px-3">{archived ? "Restore" : "Archive"}</button></form>
      {canDelete && <form action={deleteAction.bind(null, k, id)}><button className="btn-danger !min-h-9 !px-3">Delete</button></form>}
    </div>
  );
}
