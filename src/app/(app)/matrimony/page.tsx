import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { ConfirmForm } from "@/components/ConfirmForm";
import { isValidIsoDate, formatDate } from "@/lib/dates";
import { MARRIAGE_DEF } from "@/lib/matrimony/fields";
import { PAGE_SIZE } from "@/lib/registers/repository";
import { listMarriages } from "@/lib/matrimony/repository";
import { archiveMarriageAction } from "./actions";

export const metadata = { title: "Holy Matrimony Register" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TYPES = MARRIAGE_DEF.fields.find((f) => f.key === "marriage_type")!.options!;

export default async function MatrimonyList({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const archived = one(sp.archived) === "1";
  const q = one(sp.q).slice(0, 100), type = one(sp.type), from = one(sp.from), to = one(sp.to);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { rows, total } = await listMarriages(user, {
    q, type, archived, page, from: isValidIsoDate(from) ? from : undefined, to: isValidIsoDate(to) ? to : undefined,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canExport = roleCan(user.role, "export");

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, type, from, to, archived: archived ? "1" : "", ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pager: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) pager.push(p);
    else if (Math.abs(p - page) === 3) pager.push("gap");
  }

  return (
    <>
      <h1>Holy Matrimony Register</h1>
      {one(sp.saved) && (
        <div role="status" className="flash flash-success">
          Marriage record saved.
          {one(sp.pc) === "x"
            ? " The Parishioners list could not be updated automatically; it will catch up the next time this marriage is saved."
            : one(sp.pc) !== "" && ` Parishioners list updated: ${Number(one(sp.pc)) || 0} added, ${Number(one(sp.pl)) || 0} linked/updated${Number(one(sp.pf)) ? `, ${Number(one(sp.pf))} flagged for review` : ""}.`}
        </div>
      )}

      <div className="toolbar">
        <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" name="q" placeholder="Search groom, bride or record no.…" defaultValue={q} maxLength={100} style={{ width: 260 }} aria-label="Search" />
          <select name="type" defaultValue={type} aria-label="Marriage type">
            <option value="">All Marriage Types</option>
            {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="inline-label">From <input type="date" name="from" defaultValue={from} /></label>
          <label className="inline-label">To <input type="date" name="to" defaultValue={to} /></label>
          {archived && <input type="hidden" name="archived" value="1" />}
          <button className="btn btn-secondary" type="submit">Search / Filter</button>
        </form>
        <Link href="/matrimony/new" className="btn">➕ Add Marriage</Link>
        <Link href="/matrimony/import" className="btn btn-secondary">⬆ Import from Excel / CSV</Link>
        {canExport && <a href={`/matrimony/export${qs({})}`} className="btn btn-secondary">⬇ Export CSV</a>}
        <Link href={`/matrimony${qs({ archived: archived ? "" : "1", page: "" })}`} className="btn btn-secondary">{archived ? "Show Active" : "Show Archived"}</Link>
      </div>

      <p className="result-count" aria-live="polite">{total.toLocaleString()} record{total === 1 ? "" : "s"}{archived ? " (archived)" : ""}</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Record No.</th><th scope="col">Groom</th><th scope="col">Bride</th><th scope="col">Date of Marriage</th><th scope="col">Minister</th><th scope="col">Actions</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>No records found.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.recordNo}</td>
                <td>{r.groom}</td>
                <td>{r.bride}</td>
                <td>{formatDate(r.date)}</td>
                <td>{r.minister}</td>
                <td className="row-actions">
                  <Link href={`/matrimony/${r.id}`} className="btn btn-small">Edit</Link>
                  <Link href={`/matrimony/${r.id}/certificate`} className="btn btn-small btn-secondary">Certificate</Link>
                  <ConfirmForm action={archiveMarriageAction.bind(null, r.id, !archived)} message={`${archived ? "Restore" : "Archive"} this record?`}>
                    <button type="submit" className="btn btn-small btn-danger">{archived ? "Restore" : "Archive"}</button>
                  </ConfirmForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {pager.map((p, i) => p === "gap"
            ? <span key={`g${i}`}>…</span>
            : <Link key={p} href={`/matrimony${qs({ page: String(p) })}`} className={p === page ? "current" : ""} aria-current={p === page ? "page" : undefined}>{p}</Link>)}
        </nav>
      )}
    </>
  );
}
