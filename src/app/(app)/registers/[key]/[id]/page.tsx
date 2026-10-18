import { notFound } from "next/navigation";
import { RecordForm } from "@/components/RecordForm";
import { requirePermission } from "@/lib/auth/session";
import { getRegister } from "@/lib/registers/registry";
import { getRecord } from "@/lib/registers/repository";
import { buildFieldViews, recordToFormValues } from "@/lib/registers/view";
import { saveRecordAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditRecord({ params }: { params: Promise<{ key: string; id: string }> }) {
  const { key, id: rawId } = await params;
  const def = getRegister(key);
  const id = /^\d{1,10}$/.test(rawId) ? Number(rawId) : NaN;
  if (!def || !Number.isInteger(id)) notFound();
  const user = await requirePermission(def.permission);
  const rec = await getRecord(def, user, id);
  if (!rec) notFound();
  const [fields, initial] = await Promise.all([buildFieldViews(def, user.role), recordToFormValues(def, rec, {})]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit {def.label} <span className="text-base font-normal text-slate-500">#{id}</span></h1>
      <div className="card"><RecordForm fields={fields} initial={initial} action={saveRecordAction.bind(null, key, id)} cancelHref={`/registers/${key}`} isNew={false} /></div>
    </div>
  );
}
