import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { getRegister } from "@/lib/registers/registry";
import { PAGE_SIZE, listRecords } from "@/lib/registers/repository";
import { displayValue } from "@/lib/registers/view";
import { isValidIsoDate } from "@/lib/dates";
import { ConfirmForm } from "@/components/ConfirmForm";
import { archiveAction, deleteAction } from "./actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Serving/Past, derived from the departure date (blank or still in the future = serving). */
function serviceStatus(value: unknown): "current" | "past" {
  const d = String(value ?? "").trim();
  if (!d || d.startsWith("0000-00-00")) return "current";
  return d.slice(0, 10) < new Date().toISOString().slice(0, 10) ? "past" : "current";
}

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
  const searchLabel = (def.fields.find((f) => f.key === def.searchField)?.label ?? "name").toLowerCase();
  const statusField = def.serviceStatusField;

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { q, archived: archived ? "1" : "", from, to, serving, ...filters };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  // Numbered pager exactly as in PHP: first, last, current ±2, and "…" at the edges of that window.
  const pager: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) pager.push(p);
    else if (Math.abs(p - page) === 3) pager.push("gap");
  }

  return (
    <>
      <h1>{def.title}</h1>
      {def.intro && <p className="hint">{def.intro}</p>}
      {one(sp.saved) && <div role="status" className="flash flash-success">Record saved.</div>}
      {one(sp.deleted) && <div role="status" className="flash flash-success">Record deleted.</div>}

      <div className="toolbar">
        <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" name="q" placeholder={`Search ${searchLabel}…`} defaultValue={q} maxLength={100} style={{ width: 240 }} aria-label="Search" />
          {(def.filters ?? []).map((fk) => {
            const f = def.fields.find((x) => x.key === fk);
            if (!f?.options) return null;
            return (
              <select key={fk} name={fk} defaultValue={filters[fk]} aria-label={f.label}>
                <option value="">All {f.label}</option>
                {Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            );
          })}
          {def.dateFilter && (<>
            <label className="inline-label">From <input type="date" name="from" defaultValue={from} /></label>
            <label className="inline-label">To <input type="date" name="to" defaultValue={to} /></label>
          </>)}
          {statusField && (
            <select name="serving" defaultValue={serving} aria-label="Service status">
              <option value="">All (Serving &amp; Past)</option>
              <option value="serving">Currently Serving</option>
              <option value="past">Past (Left the Parish)</option>
            </select>
          )}
          {archived && <input type="hidden" name="archived" value="1" />}
          <button className="btn btn-secondary" type="submit">Search / Filter</button>
        </form>
        <Link href={`/registers/${key}/new`} className="btn">➕ Add Record</Link>
        {canExport && <a href={`/registers/${key}/export${qs({})}`} className="btn btn-secondary">⬇ Export CSV</a>}
        <Link href={`/registers/${key}${qs({ archived: archived ? "" : "1", page: "" })}`} className="btn btn-secondary">{archived ? "Show Active" : "Show Archived"}</Link>
      </div>

      <p className="result-count" aria-live="polite">{total.toLocaleString()} record{total === 1 ? "" : "s"}{archived ? " (archived)" : ""}</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
              {statusField && <th scope="col">Status</th>}
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length + 1 + (statusField ? 1 : 0)}>No records found.</td></tr>}
            {rows.map((r) => {
              const st = statusField ? serviceStatus(r[statusField]) : null;
              return (
                <tr key={r.id}>
                  {cols.map((c) => <td key={c.key}>{displayValue(def, c, r)}</td>)}
                  {st && <td><span className={`badge badge-${st}`}>{st === "current" ? "Serving" : "Past"}</span></td>}
                  <td className="row-actions">
                    <Link href={`/registers/${key}/${r.id}`} className="btn btn-small">Edit</Link>
                    <ConfirmForm action={archiveAction.bind(null, key, r.id, !archived)} message={`${archived ? "Restore" : "Archive"} this record?`}>
                      <button type="submit" className="btn btn-small btn-danger">{archived ? "Restore" : "Archive"}</button>
                    </ConfirmForm>
                    {canDelete && (
                      <ConfirmForm action={deleteAction.bind(null, key, r.id)} message="PERMANENTLY delete this record? This cannot be undone.">
                        <button type="submit" className="btn btn-small btn-danger">Delete</button>
                      </ConfirmForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {pager.map((p, i) => p === "gap"
            ? <span key={`g${i}`}>…</span>
            : <Link key={p} href={`/registers/${key}${qs({ page: String(p) })}`} className={p === page ? "current" : ""} aria-current={p === page ? "page" : undefined}>{p}</Link>)}
        </nav>
      )}
    </>
  );
}
