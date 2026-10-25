import Link from "next/link";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { countPending, searchAnnouncements } from "@/lib/announcements/repository";
import { ALL_CATEGORY_LABELS, categoryBadge, categoryLabel, isCategory } from "@/lib/announcements/categories";
import { richToText } from "@/lib/announcements/sanitize";
import { formatDate, isValidIsoDate } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";
import { archiveAnnouncementAction, syncAction } from "./actions";

export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";
const STATUS_STYLE: Record<string, { background: string; color: string }> = { approved: { background: "#eaf4ee", color: "var(--success)" }, pending: { background: "#fdf3dd", color: "#8a6100" }, rejected: { background: "#faeced", color: "var(--danger)" } };

export default async function Announcements({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const s = one(sp.start), e = one(sp.end), c = one(sp.category), st = one(sp.status), archived = one(sp.archived) === "1";
  const f = { start: isValidIsoDate(s) ? s : undefined, end: isValidIsoDate(e) ? e : undefined, category: isCategory(c) ? c : undefined, status: st, archived };
  const [rows, pending] = await Promise.all([searchAnnouncements(user, f), countPending(user)]);
  const toggle = new URLSearchParams({ ...(f.start && { start: f.start }), ...(f.end && { end: f.end }), ...(f.category && { category: f.category }), ...(st && { status: st }), ...(!archived && { archived: "1" }) });

  return (
    <>
      <h1>Announcements</h1>
      <Notice sp={sp} />
      {pending > 0 && <div className="callout callout-warning"><strong>{pending} announcement{pending === 1 ? "" : "s"} waiting for review.</strong> <Link href="/announcements/review">Review now</Link></div>}
      <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
        {archived && <input type="hidden" name="archived" value="1" />}
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={f.start ?? ""} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={f.end ?? ""} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={f.category ?? ""}><option value="">All</option>{Object.entries(ALL_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={st}><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></div>
        <button className="btn btn-secondary" type="submit">Filter</button>
        <Link href="/announcements/new" className="btn">➕ Add Announcement</Link>
        <Link href={`/announcements?${toggle}`} className="btn btn-secondary">{archived ? "Show Active" : "Show Archived"}</Link>
      </form>
      <form action={syncAction} className="no-print" style={{ margin: "8px 0 14px" }}>
        <button className="btn btn-secondary" type="submit">🔄 Sync from Google Form</button>
        <span className="hint" style={{ marginLeft: 8 }}>Pulls parishioners’ submissions in as <em>pending</em> items for review.</span>
      </form>
      <p className="result-count" aria-live="polite">{rows.length.toLocaleString()} announcement{rows.length === 1 ? "" : "s"}</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Mass date</th><th scope="col">Category</th><th scope="col">Title</th><th scope="col">Text</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7}>No announcements match.</td></tr>}
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="nowrap">{formatDate(a.announcementDate)}</td>
              <td><span className="badge" style={categoryBadge(a.category)}>{categoryLabel(a.category)}</span></td>
              <td>{a.title}</td>
              <td>{richToText(a.content).slice(0, 110)}{richToText(a.content).length > 110 ? "…" : ""}</td>
              <td>{a.source === "google_form" ? "Google Form" : a.source === "marriage_prep" ? "Marriage prep" : "Office"}</td>
              <td><span className="badge" style={STATUS_STYLE[a.status]}>{a.status}</span></td>
              <td className="row-actions">
                <Link className="btn btn-small" href={`/announcements/${a.id}`}>Edit</Link>
                <ConfirmForm action={archiveAnnouncementAction.bind(null, a.id, !archived)} message={`${archived ? "Restore" : "Archive"} this announcement?`}><button className="btn btn-small btn-danger" type="submit">{archived ? "Restore" : "Archive"}</button></ConfirmForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
