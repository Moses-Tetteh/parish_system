import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { pendingAnnouncements } from "@/lib/announcements/repository";
import { categoryBadge, categoryLabel } from "@/lib/announcements/categories";
import { sanitizeRich } from "@/lib/announcements/sanitize";
import { formatDate } from "@/lib/dates";
import type { SP } from "@/lib/forms";
import { reviewAction } from "../actions";

export const metadata = { title: "Pending Review" };
export const dynamic = "force-dynamic";

export default async function Review({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const rows = await pendingAnnouncements(user);
  return (
    <>
      <h1>Pending Review</h1>
      <Notice sp={sp} />
      <p className="hint">Public submissions (Google Form) wait here. Nothing is printed until it is approved.</p>
      {rows.length === 0 && <div className="empty-state">Nothing is waiting for review.</div>}
      {rows.map((a) => (
        <div className="card" key={a.id}>
          <div className="card-head"><span className="badge" style={categoryBadge(a.category)}>{categoryLabel(a.category)}</span> <strong>{a.title}</strong> <span className="muted">· for {formatDate(a.announcementDate)}</span></div>
          {/* content is re-sanitized to the tiny allow-list here too, so what is shown can never carry script or attributes */}
          <div style={{ margin: "10px 0" }} dangerouslySetInnerHTML={{ __html: sanitizeRich(a.content) }} />
          <p className="muted">From: {a.submittedByName || "—"}{a.submittedByContact ? ` (${a.submittedByContact})` : ""}</p>
          <form action={reviewAction} className="toolbar" style={{ alignItems: "flex-end" }}>
            <input type="hidden" name="id" value={a.id} />
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}><label htmlFor={`n${a.id}`}>Note (optional)</label><input id={`n${a.id}`} name="notes" maxLength={500} /></div>
            <button className="btn" type="submit" name="decision" value="approved">✅ Approve</button>
            <button className="btn btn-danger" type="submit" name="decision" value="rejected">✖ Reject</button>
          </form>
        </div>
      ))}
    </>
  );
}
