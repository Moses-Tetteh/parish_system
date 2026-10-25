import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { activeCandidatesFor, attendanceOn, classGroups } from "@/lib/candidates/service";
import { getRegister } from "@/lib/registers/registry";
import { isValidIsoDate, todayIso } from "@/lib/dates";
import { one, type SP } from "@/lib/forms";
import { attendanceAction } from "../../workflow/actions";

export const metadata = { title: "Class Attendance" };
export const dynamic = "force-dynamic";

export default async function Attendance({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const sp = await searchParams;
  const programs = getRegister("candidates")?.fields.find((f) => f.key === "program")?.options ?? {};
  const program = one(sp.program) in programs ? one(sp.program) : "", cls = one(sp.class_group).slice(0, 100);
  const date = isValidIsoDate(one(sp.date)) ? one(sp.date) : todayIso();
  const [list, classes] = await Promise.all([activeCandidatesFor(user, program, cls), classGroups()]);
  const marked = await attendanceOn(date, list.map((c) => c.id));
  return (
    <>
      <h1>Class Attendance</h1>
      <Notice sp={sp} />
      <form method="get" className="toolbar" style={{ alignItems: "flex-end" }}>
        <select name="program" defaultValue={program} aria-label="Programme"><option value="">All programmes</option>{Object.entries(programs).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="class_group" defaultValue={cls} aria-label="Class"><option value="">All classes</option>{classes.map((g) => <option key={g}>{g}</option>)}</select>
        <label className="inline-label">Session date <input type="date" name="date" defaultValue={date} /></label>
        <button className="btn btn-secondary" type="submit">Show</button>
        <Link className="btn btn-secondary" href="/registers/candidates">← Candidates</Link>
      </form>
      {list.length === 0 ? <p className="empty-state">No active candidates match.</p> : (
        <form action={attendanceAction}>
          <input type="hidden" name="program" value={program} /><input type="hidden" name="class_group" value={cls} /><input type="hidden" name="date" value={date} />
          <div className="table-wrap"><table>
            <thead><tr><th scope="col" style={{ width: 80 }}>Present</th><th scope="col">Name</th><th scope="col">Programme</th><th scope="col">Class</th></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" name="present" value={c.id} defaultChecked={!marked.has(c.id) || marked.get(c.id) === 1} aria-label={`${c.fullName} present`} /></td>
                <td><Link href={`/registers/candidates/${c.id}`}>{c.fullName}</Link></td><td>{programs[c.program] ?? c.program}</td><td>{c.classGroup ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="hint">Everyone starts ticked — untick those who were absent, then save. Saving again for the same date updates it.</p>
          <button className="btn" type="submit">💾 Save attendance</button>
        </form>
      )}
    </>
  );
}
