import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { WORKFLOW_FIELDS } from "@/lib/settings-admin/fields";
import { allSettings } from "@/lib/settings-admin/repository";
import type { SP } from "@/lib/forms";
import { saveWorkflowAction } from "../actions";

export const metadata = { title: "Workflow Settings" };
export const dynamic = "force-dynamic";

export default async function Workflow({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("settings.manage");
  const cur = await allSettings(user);
  return (
    <>
      <h1>Workflow Settings</h1>
      <Notice sp={await searchParams} />
      <form action={saveWorkflowAction} className="card" style={{ maxWidth: 720 }}>
        {WORKFLOW_FIELDS.map((f) => {
          const val = cur[f.key] ?? f.def;
          return (
            <div className="field" style={{ marginBottom: 14 }} key={f.key}>
              {f.type === "bool"
                ? <label className="check-inline"><input type="checkbox" name={f.key} value="1" defaultChecked={val === "1"} /> <strong>{f.label}</strong></label>
                : <><label htmlFor={f.key}><strong>{f.label}</strong></label><input id={f.key} type="number" name={f.key} defaultValue={val} min={f.min} max={f.max} style={{ width: 120 }} /></>}
              <p className="hint" style={{ margin: "2px 0 0" }}>{f.help}</p>
            </div>
          );
        })}
        <div className="form-actions"><button className="btn" type="submit">Save settings</button><Link href="/admin/settings" className="btn btn-secondary">Back</Link></div>
      </form>
    </>
  );
}
