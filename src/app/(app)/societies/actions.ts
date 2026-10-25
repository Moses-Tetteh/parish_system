"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { back, dateOf, intOf, moneyOf, optStr, str } from "@/lib/forms";
import { isValidPeriod } from "@/lib/societies/rules";
import { SocietyError, SocietyForbiddenError, addMember, addMeeting, recordDues, removeMember } from "@/lib/societies/service";

function msg(e: unknown, fallback: string): string {
  if (e instanceof SocietyForbiddenError) redirect("/forbidden");
  if (e instanceof SocietyError) return e.message;
  console.error("society action failed", e);
  return fallback;
}

export async function societyAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const sid = intOf(fd, "society_id"), act = str(fd, "do", 20);
  if (!sid) redirect("/registers/societies");
  const period = str(fd, "period", 10);
  const here = `/societies/${sid}${isValidPeriod(period) ? `?period=${encodeURIComponent(period)}` : ""}`;
  try {
    switch (act) {
      case "add_member": await addMember(user, sid, { parishionerId: intOf(fd, "parishioner_id"), fullName: str(fd, "full_name", 250), office: str(fd, "office", 60), phone: optStr(fd, "phone", 60) }); back(here, "ok", "Member added.");
      case "remove_member": await removeMember(user, sid, intOf(fd, "member_id") ?? 0); back(here, "ok", "Member removed (their dues history is kept).");
      case "add_meeting": {
        const date = dateOf(fd, "meeting_date");
        if (!date) back(here, "error", "Enter a valid meeting date.");
        await addMeeting(user, sid, { date: date!, venue: optStr(fd, "venue", 200), attendance: intOf(fd, "attendance"), summary: optStr(fd, "summary", 2000) });
        back(here, "ok", "Meeting recorded.");
      }
      case "pay": {
        const amount = moneyOf(fd, "amount");
        if (amount === null || amount <= 0) back(here, "error", "Enter a valid amount and period.");
        await recordDues(user, sid, intOf(fd, "member_id") ?? 0, period, amount!);
        back(here, "ok", `Payment of GHS ${amount!.toFixed(2)} recorded.`);
      }
      default: back(here, "error", "Unknown action.");
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    back(here, "error", msg(e, "The action could not be completed."));
  }
}
