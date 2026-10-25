"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { back, dateOf, intOf, str } from "@/lib/forms";
import { RosterError, RosterForbiddenError, assign, copyLastWeek, unassign } from "@/lib/roster/service";

export async function rosterAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const week = dateOf(fd, "date") ?? new Date().toISOString().slice(0, 10), here = `/roster?date=${week}`, act = str(fd, "do", 20);
  try {
    switch (act) {
      case "add": {
        const date = dateOf(fd, "mass_date");
        if (!date) back(here, "error", "Invalid Mass date or time.");
        await assign(user, { date: date!, time: str(fd, "mass_time", 5), outstationId: intOf(fd, "outstation_id") || null, ministry: str(fd, "ministry", 40), name: str(fd, "person_name", 250), parishionerId: intOf(fd, "parishioner_id") || null });
        back(here, "ok", "Assigned.");
      }
      case "remove": await unassign(user, intOf(fd, "id") ?? 0); back(here, "ok", "Assignment removed.");
      case "copy_week": { const n = await copyLastWeek(user, dateOf(fd, "week") ?? week); back(here, "ok", `${n} assignment${n === 1 ? "" : "s"} copied from last week.`); }
      default: back(here, "error", "Unknown action.");
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof RosterForbiddenError) redirect("/forbidden");
    back(here, "error", e instanceof RosterError ? e.message : "The action could not be completed.");
  }
}
