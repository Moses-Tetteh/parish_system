import Link from "next/link";
import { asc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { todayIso } from "@/lib/dates";
import { COLOUR_HEX, addDays, dayOfWeek, easter, adventStart } from "@/lib/liturgy/calendar";
import { loadCalendar } from "@/lib/liturgy/service";
import { one, type SP } from "@/lib/forms";

export const metadata = { title: "Liturgical Calendar" };
export const dynamic = "force-dynamic";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const longDate = (d: string) => `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek(d)]}, ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("registers");
  const sp = await searchParams, today = todayIso();
  const year = Math.max(1990, Math.min(2100, Number(one(sp.year)) || Number(today.slice(0, 4))));
  const month = Math.max(1, Math.min(12, Number(one(sp.month)) || Number(today.slice(5, 7))));
  const cal = await loadCalendar();
  const times = await db().select({ t: schema.massTimes, o: schema.outstations.name }).from(schema.massTimes).leftJoin(schema.outstations, eq(schema.outstations.id, schema.massTimes.outstationId))
    .where(and(eq(schema.massTimes.isActive, 1), eq(schema.massTimes.isArchived, 0))).orderBy(asc(schema.massTimes.dayOfWeek), asc(schema.massTimes.massTime));
  const byDow = new Map<number, string[]>();
  for (const { t, o } of times) (byDow.get(t.dayOfWeek) ?? byDow.set(t.dayOfWeek, []).get(t.dayOfWeek)!).push(`${t.massTime.slice(0, 5)}${o ? ` (${o})` : ""}`);

  const first = `${year}-${String(month).padStart(2, "0")}-01`, n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const e = easter(year);
  const key: [string, string][] = [["Ash Wednesday", addDays(e, -46)], ["Palm Sunday", addDays(e, -7)], ["Easter Sunday", e], ["Pentecost", addDays(e, 49)], ["First Sunday of Advent", adventStart(year)]];
  const hdo: [string, string][] = [];
  for (let d = `${year}-01-01`; d.startsWith(String(year)); d = addDays(d, 1)) { if (dayOfWeek(d) === 0) continue; const l = cal.forDate(d); if (l.holyDayOfObligation) hdo.push([d, l.name]); }
  const prev = month === 1 ? `year=${year - 1}&month=12` : `year=${year}&month=${month - 1}`, next = month === 12 ? `year=${year + 1}&month=1` : `year=${year}&month=${month + 1}`;

  return (
    <>
      <h1>Liturgical Calendar</h1>
      <p className="hint">Seasons, colours and feasts for planning rosters and announcements. Moveable feasts are calculated; fixed feasts come from <Link href="/registers/liturgical_days">your feast-day list</Link>. Always confirm against the national Ordo.</p>
      <div className="toolbar no-print">
        <Link className="btn btn-secondary" href={`/calendar?${prev}`} aria-label="Previous month">←</Link>
        <strong style={{ minWidth: 150, textAlign: "center" }}>{MONTHS[month - 1]} {year}</strong>
        <Link className="btn btn-secondary" href={`/calendar?${next}`} aria-label="Next month">→</Link>
        <Link className="btn btn-secondary" href="/calendar">Today</Link>
        <Link className="btn btn-secondary" href="/registers/mass_times">Mass times</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        <div className="card"><div className="table-wrap"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Celebration</th><th scope="col">Season</th><th scope="col">Mass times</th></tr></thead>
          <tbody>{Array.from({ length: n }, (_, i) => {
            const d = addDays(first, i), l = cal.forDate(d), notable = l.isSunday || l.rank !== "weekday";
            return (
              <tr key={d} style={l.isSunday ? { background: "var(--gold-pale)" } : undefined}>
                <td className="nowrap">{SHORT[dayOfWeek(d)]} {i + 1}</td>
                <td><span title={l.colour} style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: COLOUR_HEX[l.colour] ?? "#999", border: "1px solid #999", marginRight: 6 }} />
                  {notable ? <strong>{l.name}</strong> : l.name}{l.holyDayOfObligation && !l.isSunday ? <> <span className="badge" style={{ background: "#fdf3dd", color: "#8a6100" }}>Holy day of obligation</span></> : null}
                  {l.also.length > 0 && <><br /><small>Also: {l.also.join("; ")}</small></>}</td>
                <td>{l.season}</td><td><small>{notable ? (byDow.get(dayOfWeek(d)) ?? []).join(", ") : ""}</small></td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
        <div className="card">
          <h3>Key dates {year}</h3>
          <ul className="plain-list">{key.map(([l, d]) => <li key={l}><strong>{l}</strong> — {longDate(d)}</li>)}</ul>
          <h3>Holy days of obligation {year}</h3>
          <ul className="plain-list">{hdo.length ? hdo.map(([d, nm]) => <li key={d}><strong>{longDate(d)}</strong> — {nm}</li>) : <li className="hint">None marked.</li>}</ul>
          <p className="hint">Sundays are always days of obligation. Edit the feast-day list to match your Bishops’ Conference.</p>
        </div>
      </div>
    </>
  );
}
