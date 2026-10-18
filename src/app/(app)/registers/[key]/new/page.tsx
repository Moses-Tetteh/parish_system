import { notFound } from "next/navigation";
import { RecordForm } from "@/components/RecordForm";
import { requirePermission } from "@/lib/auth/session";
import { getRegister } from "@/lib/registers/registry";
import { EXCLUSIVE_RULES } from "@/lib/registers/exclusive";
import { initialValues } from "@/lib/registers/validation";
import { buildFieldViews, recordToFormValues } from "@/lib/registers/view";
import { saveRecordAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRecord({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getRegister(key);
  if (!def) notFound();
  const user = await requirePermission(def.permission);
  const [fields, initial] = await Promise.all([buildFieldViews(def, user.role), recordToFormValues(def, null, initialValues(def))]);
  return (
    <>
      <h1>Add {def.label} Record</h1>
      <div className="card">
        <RecordForm fields={fields} initial={initial} action={saveRecordAction.bind(null, key, null)} exclusive={EXCLUSIVE_RULES[key]} cancelHref={`/registers/${key}`} isNew />
      </div>
    </>
  );
}
