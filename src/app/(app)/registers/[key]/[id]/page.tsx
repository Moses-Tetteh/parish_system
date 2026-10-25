import { Notice } from "@/components/Notice";
import type { SP } from "@/lib/forms";
import { notFound } from "next/navigation";
import { RecordForm } from "@/components/RecordForm";
import { requirePermission } from "@/lib/auth/session";
import { getRegister } from "@/lib/registers/registry";
import { EXCLUSIVE_RULES } from "@/lib/registers/exclusive";
import { getRecord } from "@/lib/registers/repository";
import { buildFieldViews, recordToFormValues } from "@/lib/registers/view";
import { saveRecordAction } from "../actions";
import { MarriagePrepPanel } from "@/components/panels/MarriagePrepPanel";
import { CandidatePanel } from "@/components/panels/CandidatePanel";

export const dynamic = "force-dynamic";

export default async function EditRecord({ params, searchParams }: { params: Promise<{ key: string; id: string }>; searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { key, id: rawId } = await params;
  const def = getRegister(key);
  const id = /^\d{1,10}$/.test(rawId) ? Number(rawId) : NaN;
  if (!def || !Number.isInteger(id)) notFound();
  const user = await requirePermission(def.permission);
  const rec = await getRecord(def, user, id);
  if (!rec) notFound();
  const [fields, initial] = await Promise.all([buildFieldViews(def, user.role), recordToFormValues(def, rec, {})]);
  return (
    <>
      <h1>Edit {def.label} Record</h1>
      <Notice sp={sp} />
      <div className="card">
        <RecordForm fields={fields} initial={initial} action={saveRecordAction.bind(null, key, id)} exclusive={EXCLUSIVE_RULES[key]} cancelHref={`/registers/${key}`} isNew={false} />
      </div>
      {/* register-specific workflow panels (PHP: after_form hooks) */}
      {key === "marriage_prep" && <MarriagePrepPanel user={user} id={id} />}
      {key === "candidates" && <CandidatePanel user={user} id={id} />}
    </>
  );
}
