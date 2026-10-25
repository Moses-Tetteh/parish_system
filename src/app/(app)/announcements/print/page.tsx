import { PrintButton } from "@/components/PrintButton";
import { requirePermission } from "@/lib/auth/session";
import { searchAnnouncements } from "@/lib/announcements/repository";
import { CATEGORIES, CLOSING_LINE, FUNERAL_PRINT_NOTE, isCategory, nextSunday } from "@/lib/announcements/categories";
import { sanitizeRich } from "@/lib/announcements/sanitize";
import { getSetting } from "@/lib/app-settings";
import { formatDate, isValidIsoDate, todayIso } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";

export const metadata = { title: "Print Announcements" };
export const dynamic = "force-dynamic";

export default async function PrintAnnouncements({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const sunday = nextSunday(todayIso());
  const start = isValidIsoDate(one(sp.start)) ? one(sp.start) : sunday, end = isValidIsoDate(one(sp.end)) ? one(sp.end) : sunday;
  const category = isCategory(one(sp.category)) ? one(sp.category) : "";
  const rows = await searchAnnouncements(user, { start, end, category, status: "approved" });
  const parish = await getSetting("parish_name", "Blessed Clementina Parish");
  const cats = (category ? [[category, (CATEGORIES as Record<string, string>)[category] ?? category]] : Object.entries(CATEGORIES)) as [string, string][];
  const groups = cats.map(([k, l]) => ({ k, l, items: rows.filter((r) => r.category === k) })).filter((g) => g.items.length);

  return (
    <>
      <h1 className="no-print">Print Announcements</h1>
      <div className="card no-print">
        <h2>Choose what to print</h2>
        <form method="get" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={start} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={end} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={category}><option value="">All categories</option>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l} only</option>)}</select></div>
          <button className="btn btn-secondary" type="submit">Preview</button>
          <PrintButton />
          <button className="btn" type="submit" formAction="/announcements/download/pdf" formTarget="_blank">📄 Download PDF</button>
        </form>
        <p className="hint">Only approved announcements are included, by the Mass date they are for. Categories with nothing to announce are left off. Submitters’ contact details are never printed.</p>
      </div>
      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: "1.2rem" }}>{parish}</div><div style={{ fontWeight: 700, fontSize: "1.05rem" }}>Announcements</div>
          <div className="muted">{start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`}</div>
        </div>
        {groups.length === 0 && <p>No approved announcements match this range/category.</p>}
        {groups.map((g) => (
          <section key={g.k} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: "1.05rem", textTransform: "uppercase" }}>{g.l}</h2>
            {g.items.map((a) => (<div key={a.id} style={{ marginBottom: 10 }}><strong>{formatDate(a.announcementDate)} — {a.title}</strong><div dangerouslySetInnerHTML={{ __html: sanitizeRich(a.content) }} /></div>))}
            {g.k === "funeral" && <p style={{ fontStyle: "italic", whiteSpace: "pre-line" }}>{FUNERAL_PRINT_NOTE}</p>}
          </section>
        ))}
        {groups.length > 0 && <p><strong>{CLOSING_LINE}</strong></p>}
      </div>
    </>
  );
}
