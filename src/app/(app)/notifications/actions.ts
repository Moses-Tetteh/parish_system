"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { back, dateOf, intOf, optStr, str } from "@/lib/forms";
import { todayIso } from "@/lib/dates";
import { NotificationError, NotificationForbiddenError, markSent, recordIncoming } from "@/lib/notifications/service";

function msg(e: unknown, fallback: string): string {
  if (e instanceof NotificationForbiddenError) redirect("/forbidden");
  if (e instanceof NotificationError) return e.message;
  console.error("notification action failed", e);
  return fallback;
}

export async function markSentAction(fd: FormData): Promise<void> {
  const user = await requirePermission("notifications");
  const place = str(fd, "place", 250), here = "/notifications";
  const date = dateOf(fd, "sent_on");
  if (!date) back(here, "error", "Enter the date the notification was sent.");
  const keys = fd.getAll("keys").filter((k): k is string => typeof k === "string");
  if (!keys.length) back(here, "error", "Select at least one event.");
  let n: number;
  try { n = await markSent(user, keys, date!, str(fd, "method", 60), str(fd, "reference_no", 100)); } catch (e) { back(here, "error", msg(e, "Could not record the notification.")); }
  back(here, "ok", `${n!} event${n! === 1 ? "" : "s"} marked as notified${place ? ` to ${place}` : ""}.`);
}

export async function incomingAction(fd: FormData): Promise<void> {
  const user = await requirePermission("notifications");
  const id = intOf(fd, "baptism_id");
  if (!id) back("/notifications", "error", "Pick the baptism entry from the search list.");
  const bad = ["event_date", "received_on"].some((k) => str(fd, k, 10) && !dateOf(fd, k));
  if (bad) back("/notifications", "error", "One of the dates is not valid.");
  try { await recordIncoming(user, id!, { type: str(fd, "event_type", 30), date: dateOf(fd, "event_date"), place: optStr(fd, "event_place", 250), parish: optStr(fd, "notifying_parish", 250), ref: optStr(fd, "letter_ref", 100), received: dateOf(fd, "received_on") ?? todayIso(), notes: optStr(fd, "notes", 300) }); }
  catch (e) { back("/notifications", "error", msg(e, "Could not record the notice.")); }
  back("/notifications", "ok", "Notice recorded and noted on the baptismal entry.");
}
