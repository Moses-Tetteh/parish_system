import { Notice } from "@/components/Notice";
import type { SP } from "@/lib/forms";
import { saveHouseholdAction } from "../actions";
import { HouseholdForm } from "../HouseholdForm";

export const metadata = { title: "Add Household" };
export default async function NewHousehold({ searchParams }: { searchParams: Promise<SP> }) {
  return (<><h1>Add Household</h1><Notice sp={await searchParams} /><HouseholdForm action={saveHouseholdAction.bind(null, null)} cancelHref="/households" /></>);
}
