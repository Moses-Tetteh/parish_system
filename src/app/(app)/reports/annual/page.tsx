import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PrintButton } from "@/components/PrintButton";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { buildAnnualReport, canIncludeFinance } from "@/lib/reports/annual";
import { listSnapshots, loadSnapshot } from "@/lib/reports/snapshots";
import { getSetting } from "@/lib/app-settings";
import { todayIso } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";
import { snapshotAction } from "./actions";

export const metadata = { title: "Annual Statistical Report" };
export const dynamic = "force-dynamic";

export default async function Annual({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("reports.annual");
  const sp = await searchParams, today = todayIso();
  const includeFinance = canIncludeFinance(user);
  const snapId = Number(one(sp.snapshot)) || 0;
  const frozen = snapId > 0 ? await loadSnapshot(snapId, includeFinance) : null;
  const y = Number(one(sp.year));
  const year = frozen?.year ?? (Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) <= 2 ? 1 : 0));
  const report = frozen ?? (await buildAnnualReport(year, includeFinance));
  const [parish, snaps] = await Promise.all([getSetting("parish_name", "Blessed Clementina Parish"), listSnapshots(year)]);
  const qs = frozen ? `snapshot=${snapId}` : `year=${year}`;

  return (
    <>
      <h1 className="no-print">Annual Statistical Report</h1>
      <Notice sp={sp} />
      <div className="no-print">
        <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
          <label className="inline-label">Year <input type="number" name="year" defaultValue={year} min={2000} max={2100} style={{ width: 90 }} /></label>
          <button className="btn btn-secondary" type="submit">Show</button>
          <PrintButton />
          <a className="btn btn-secondary" href={`/reports/annual/download?format=csv&${qs}`}>⬇ CSV</a>
          {roleCan(user.role, "export") && <a className="btn btn-secondary" href={`/reports/annual/download?format=pdf&${qs}`} target="_blank" rel="noreferrer">📄 PDF</a>}
        </form>
        {frozen && <div className="callout callout-info">You are viewing a <strong>frozen copy</strong> of the {year} report. <Link href={`/reports/annual?year=${year}`}>Back to the live report</Link></div>}
        <p className="hint">Built from the registers as they are today, for the diocesan statistical return. {includeFinance ? "" : "Finance figures are shown only to roles with access to them."}</p>
      </div>
      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 14 }}><strong style={{ fontSize: "1.2rem" }}>{parish}</strong><br /><strong>Annual Statistical Report {year}</strong></div>
        {report.sections.map((sec) => (
          <section key={sec.title} style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: "1.05rem" }}>{sec.title}</h2>
            <div className="table-wrap"><table><tbody>{sec.rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td className="nowrap" style={{ textAlign: "right" }}><strong>{r[1]}</strong></td><td className="muted">{r[2] ?? ""}</td></tr>)}</tbody></table></div>
          </section>
        ))}
      </div>
      {roleCan(user.role, "reports.snapshot") && !frozen && (
        <div className="card no-print">
          <h2>Frozen copies</h2>
          <form action={snapshotAction}><input type="hidden" name="year" value={year} /><button className="btn" type="submit">📌 Save a frozen copy of {year}</button></form>
          {snaps.length > 0 && <ul className="plain-list" style={{ marginTop: 10 }}>{snaps.map((s) => <li key={s.id}><Link href={`/reports/annual?snapshot=${s.id}`}>Saved {String(s.savedAt).slice(0, 16).replace("T", " ")}</Link> by {s.savedBy}</li>)}</ul>}
        </div>
      )}
    </>
  );
}
