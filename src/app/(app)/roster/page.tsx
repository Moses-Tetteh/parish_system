import Link from "next/link";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Notice } from "@/components/Notice";
import { PrintButton } from "@/components/PrintButton";
import { requirePermission } from "@/lib/auth/session";
import { formatDate, isValidIsoDate, todayIso } from "@/lib/dates";
import { COLOUR_HEX, addDays, weekStart } from "@/lib/liturgy/calendar";
import { loadCalendar } from "@/lib/liturgy/service";
import { MINISTRIES, weekRoster } from "@/lib/roster/service";
import { one, type SP } from "@/lib/forms";
import { rosterAction } from "./actions";

export const metadata = { title: "Ministry Roster" };
export const dynamic = "force-dynamic";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Roster({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const given = isValidIsoDate(one(sp.date)) ? one(sp.date) : todayIso();
  const start = weekStart(given), end = addDays(start, 6);
  const [cal, r] = await Promise.all([loadCalendar(), weekRoster(user, start)]);

  return (
    <>
      <div className="no-print toolbar">
        <Link className="btn btn-secondary" href={`/roster?date=${addDays(start, -7)}`}>← Previous</Link>
        <form method="get" style={{ display: "inline-flex", gap: 6 }}><input type="date" name="date" defaultValue={given} aria-label="Week containing" /><button className="btn btn-secondary" type="submit">Go</button></form>
        <Link className="btn btn-secondary" href={`/roster?date=${addDays(start, 7)}`}>Next →</Link>
        <PrintButton label="🖨 Print roster" />
        <ConfirmForm action={rosterAction} message="Copy last week’s assignments into this week? Existing entries are kept.">
          <input type="hidden" name="do" value="copy_week" /><input type="hidden" name="week" value={start} /><input type="hidden" name="date" value={start} /><button className="btn btn-secondary" type="submit">⎘ Copy last week</button>
        </ConfirmForm>
      </div>
      <h1>Ministry Roster — {formatDate(start)} to {formatDate(end)}</h1>
      <Notice sp={sp} />
      {!r.hasTimes && <p className="callout callout-warning no-print">No Mass times are set up yet — <Link href="/registers/mass_times/new">add your Mass times</Link> so each Mass appears here automatically.</p>}

      {Array.from({ length: 7 }, (_, d) => {
        const ymd = addDays(start, d), lit = cal.forDate(ymd);
        const slots = new Map(r.slotsByDow.get(d) ?? []);
        for (const [k, s] of r.extraSlots.get(ymd) ?? []) if (!slots.has(k)) slots.set(k, s);
        if (slots.size === 0) return null;
        return (
          <div className="card day-card" key={ymd}>
            <div className="card-head"><h3><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: COLOUR_HEX[lit.colour] ?? "#999", border: "1px solid #999", marginRight: 6 }} title={lit.colour} />{DAYS[d]}, {formatDate(ymd)} <small>— {lit.name}</small></h3></div>
            {[...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, slot]) => {
              const by = r.assigned.get(ymd)?.get(k) ?? [];
              return (
                <div className="mass-slot" key={k} style={{ margin: "10px 0" }}>
                  <div><strong>{slot.time}</strong> · {slot.outstation ?? "Main church"}</div>
                  {by.length === 0 ? <span className="hint">Nobody assigned yet.</span> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, margin: "6px 0" }}>
                      {Object.entries(MINISTRIES).map(([mk, ml]) => {
                        const who = by.filter((a) => a.ministry === mk);
                        return who.length ? (
                          <div key={mk}><span className="muted">{ml}</span><br />
                            {who.map((a) => (
                              <span key={a.id} style={{ marginRight: 8 }}>{a.personName}
                                <ConfirmForm action={rosterAction} message={`Remove ${a.personName}?`} className="no-print" ><input type="hidden" name="do" value="remove" /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="date" value={start} /><button className="btn btn-small btn-danger" type="submit" aria-label={`Remove ${a.personName}`} style={{ padding: "0 6px", marginLeft: 4 }}>×</button></ConfirmForm>
                              </span>
                            ))}
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  <form action={rosterAction} className="no-print inline-form">
                    <input type="hidden" name="do" value="add" /><input type="hidden" name="date" value={start} /><input type="hidden" name="mass_date" value={ymd} /><input type="hidden" name="mass_time" value={slot.time} /><input type="hidden" name="outstation_id" value={slot.oid ?? ""} />
                    <select name="ministry" required aria-label="Ministry">{Object.entries(MINISTRIES).map(([mk, ml]) => <option key={mk} value={mk}>{ml}</option>)}</select>
                    <input name="person_name" placeholder="Name" required maxLength={250} aria-label="Person's name" />
                    <button className="btn btn-small" type="submit">＋ Assign</button>
                  </form>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
