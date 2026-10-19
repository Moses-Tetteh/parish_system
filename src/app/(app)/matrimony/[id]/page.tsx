import { notFound } from "next/navigation";
import { MatrimonyForm } from "@/components/MatrimonyForm";
import { requirePermission } from "@/lib/auth/session";
import { marriageFormModel } from "@/lib/matrimony/form-data";
import { getMarriage } from "@/lib/matrimony/repository";
import { saveMarriageAction } from "../actions";

export const metadata = { title: "Edit Holy Matrimony Record" };
export const dynamic = "force-dynamic";

export default async function EditMarriage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = /^\d{1,10}$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isInteger(id)) notFound();
  const user = await requirePermission("registers");
  const data = await getMarriage(user, id);
  if (!data) notFound();
  const model = await marriageFormModel(user.role, data);
  return (
    <>
      <h1>Edit Holy Matrimony Record</h1>
      <MatrimonyForm {...model} action={saveMarriageAction.bind(null, id)} cancelHref="/matrimony" isEdit />
    </>
  );
}
