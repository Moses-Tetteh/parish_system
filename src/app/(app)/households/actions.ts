"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { back, intOf, oneOf, optStr, str } from "@/lib/forms";
import { HouseholdForbiddenError, HouseholdInputError, RELATIONSHIPS, addHouseholdMember, removeHouseholdMember, saveHousehold, setHouseholdArchived } from "@/lib/households/repository";

function msg(e: unknown, fallback: string): string {
  if (e instanceof HouseholdForbiddenError) redirect("/forbidden");
  if (e instanceof HouseholdInputError) return e.message;
  console.error("household action failed", e);
  return fallback;
}

export async function saveHouseholdAction(id: number | null, fd: FormData): Promise<void> {
  const user = await requirePermission("registers");
  const here = id ? `/households/${id}/edit` : "/households/new";
  const name = str(fd, "household_name", 200);
  if (!name) back(here, "error", "‘Household Name’ is required.");
  let savedId: number;
  try {
    savedId = await saveHousehold(user, id, { householdName: name, headOfHousehold: optStr(fd, "head_of_household", 200), address: optStr(fd, "address", 250), phone: optStr(fd, "phone", 100), notes: optStr(fd, "notes", 4000) });
  } catch (e) { back(here, "error", msg(e, "Could not save the household. Please try again.")); }
  back(`/households/${savedId!}`, "ok", id ? "Household updated." : "Household created. Now add its members.");
}

export async function archiveHouseholdAction(id: number, archived: boolean): Promise<void> {
  const user = await requirePermission("registers");
  try { await setHouseholdArchived(user, id, archived); } catch (e) { back("/households", "error", msg(e, "Could not update the household.")); }
  back(archived ? "/households" : "/households?archived=1", "ok", archived ? "Household archived." : "Household restored.");
}

export async function addMemberAction(householdId: number, fd: FormData): Promise<void> {
  const user = await requirePermission("registers");
  const here = `/households/${householdId}`;
  const name = str(fd, "full_name", 200);
  if (!name) back(here, "error", "‘Full Name’ is required.");
  let similarTo: string | null = null;
  try {
    ({ similarTo } = await addHouseholdMember(user, householdId, { fullName: name, relationship: oneOf(fd, "relationship", RELATIONSHIPS), linkedMemberId: intOf(fd, "linked_member_id"), notes: optStr(fd, "notes", 2000) }));
  } catch (e) { back(here, "error", msg(e, "Could not add the member.")); }
  if (similarTo) back(here, "ok", `Member added. Note: “${name}” looks similar to “${similarTo}”, already in this household — worth checking it isn’t a duplicate entry.`);
  back(here, "ok", "Member added.");
}

export async function removeMemberAction(householdId: number, rowId: number): Promise<void> {
  const user = await requirePermission("registers");
  try { await removeHouseholdMember(user, householdId, rowId); } catch (e) { back(`/households/${householdId}`, "error", msg(e, "Could not remove the member.")); }
  back(`/households/${householdId}`, "ok", "Member removed from the household.");
}
