import { MatrimonyForm } from "@/components/MatrimonyForm";
import { requirePermission } from "@/lib/auth/session";
import { marriageFormModel } from "@/lib/matrimony/form-data";
import { saveMarriageAction } from "../actions";

export const metadata = { title: "Add Holy Matrimony Record" };
export const dynamic = "force-dynamic";

export default async function NewMarriage() {
  const user = await requirePermission("registers");
  const model = await marriageFormModel(user.role, null);
  return (
    <>
      <h1>Add Holy Matrimony Record</h1>
      <MatrimonyForm {...model} action={saveMarriageAction.bind(null, null)} cancelHref="/matrimony" isEdit={false} />
    </>
  );
}
