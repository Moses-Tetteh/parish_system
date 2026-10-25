import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { irregularUnions } from "@/lib/parishioners/tools";

export const metadata = { title: "Marriages to Regularise" };
export const dynamic = "force-dynamic";
const MARITAL: Record<string, string> = { married_customary: "Customary marriage only (not in Church)", civil_only: "Civil marriage only", divorced_remarried: "Divorced & remarried (irregular)" };
const PRACTISING: Record<string, string> = { practising: "Practising", non_practising: "Not practising", unknown: "Not recorded" };

export default async function Irregular() {
  const user = await requirePermission("sensitive.irregular");
  const rows = await irregularUnions(user);
  return (
    <>
      <h1>Marriages to Regularise</h1>
      <p className="hint">🔒 Confidential pastoral list — visible to priests and administrators only; every view and export is logged. Use it to plan pastoral accompaniment (convalidation, annulment inquiry, marriage-preparation outreach), not for public display.</p>
      <p><a className="btn btn-secondary" href="/parishioners/irregular/export">⬇ Export CSV</a> <Link className="btn btn-secondary" href="/registers/parishioners">← Parishioners</Link></p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Name</th><th scope="col">Outstation</th><th scope="col">Situation</th><th scope="col">Spouse</th><th scope="col">Practising</th><th scope="col">Phone</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6}>No one is currently recorded in this situation.</td></tr>}
          {rows.map(({ p, outstation }) => (
            <tr key={p.id}><td><Link href={`/registers/parishioners/${p.id}`}>{p.fullName}</Link></td><td>{outstation ?? "—"}</td><td>{MARITAL[p.maritalStatus ?? ""] ?? p.maritalStatus}</td><td>{p.spouseName ?? "—"}</td><td>{PRACTISING[p.practisingStatus ?? ""] ?? p.practisingStatus}</td><td>{p.phone ?? "—"}</td></tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
