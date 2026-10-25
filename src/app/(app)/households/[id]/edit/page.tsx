import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { getHousehold } from "@/lib/households/repository";
import type { SP } from "@/lib/forms";
import { saveHouseholdAction } from "../../actions";
import { HouseholdForm } from "../../HouseholdForm";

export const metadata = { title: "Edit Household" };
export const dynamic = "force-dynamic";
export default async function EditHousehold({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("registers");
  const { id: raw } = await params;
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const data = await getHousehold(user, Number(raw));
  if (!data) notFound();
  return (<><h1>Edit Household</h1><Notice sp={await searchParams} /><HouseholdForm action={saveHouseholdAction.bind(null, data.household.id)} h={data.household} cancelHref={`/households/${data.household.id}`} /></>);
}
