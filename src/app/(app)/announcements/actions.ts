"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { back, dateOf, intOf, oneOf, optStr, str } from "@/lib/forms";
import type { FormState } from "@/lib/registers/form-model";
import { todayIso } from "@/lib/dates";
import { AnnouncementError, AnnouncementForbiddenError, reviewAnnouncement, saveAnnouncement, setAnnouncementArchived, syncGoogleForm } from "@/lib/announcements/repository";

const echo = (fd: FormData) => { const o: Record<string, string> = {}; for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v; return o; };
function fail(e: unknown, fallback: string): string {
  if (e instanceof AnnouncementForbiddenError) redirect("/forbidden");
  if (e instanceof AnnouncementError) return e.message;
  console.error("announcement action failed", e);
  return fallback;
}

export async function saveAnnouncementAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("registers");
  const date = dateOf(fd, "announcement_date"), title = str(fd, "title", 200), content = str(fd, "content", 20000);
  const errors: Record<string, string> = {};
  if (!date) errors.announcement_date = "Enter the Mass date.";
  if (!title) errors.title = "Enter a title.";
  if (!content.replace(/<[^>]*>|&nbsp;/g, "").trim()) errors.content = "Enter the announcement text.";
  if (Object.keys(errors).length) return { errors, values: echo(fd), message: "Please fix the highlighted fields." };
  try {
    await saveAnnouncement(user, id, { category: str(fd, "category", 40), announcementDate: date!, title, content, submittedByName: optStr(fd, "submitted_by_name", 200), submittedByContact: optStr(fd, "submitted_by_contact", 200) });
  } catch (e) { return { values: echo(fd), message: fail(e, "Could not save the announcement. Please try again.") }; }
  redirect(`/announcements?ok=${encodeURIComponent(id ? "Announcement updated." : "Announcement recorded.")}`);
}

export async function archiveAnnouncementAction(id: number, archived: boolean): Promise<void> {
  const user = await requirePermission("registers");
  try { await setAnnouncementArchived(user, id, archived); } catch (e) { back("/announcements", "error", fail(e, "Could not update the announcement.")); }
  back(archived ? "/announcements" : "/announcements?archived=1", "ok", archived ? "Announcement archived." : "Announcement restored.");
}

export async function reviewAction(fd: FormData): Promise<void> {
  const user = await requirePermission("registers");
  const id = intOf(fd, "id"), decision = oneOf(fd, "decision", ["approved", "rejected"] as const);
  if (!id || !decision) back("/announcements/review", "error", "Invalid decision.");
  try { await reviewAnnouncement(user, id!, decision!, optStr(fd, "notes", 500)); } catch (e) { back("/announcements/review", "error", fail(e, "Could not record the decision.")); }
  back("/announcements/review", "ok", decision === "approved" ? "Announcement approved." : "Announcement rejected.");
}

export async function syncAction(): Promise<void> {
  const user = await requirePermission("registers");
  let msg: string, kind: "ok" | "error" = "ok";
  try {
    const r = await syncGoogleForm(user, todayIso());
    msg = `Sync complete: ${r.imported} new announcement${r.imported === 1 ? "" : "s"} imported${r.skipped ? `, ${r.skipped} skipped.` : "."}`;
    if (r.errors.length) { msg += ` Details: ${r.errors.slice(0, 5).join(" | ")}${r.errors.length > 5 ? ` (+${r.errors.length - 5} more)` : ""}`; if (!r.imported) kind = "error"; }
  } catch (e) { kind = "error"; msg = `Sync failed: ${e instanceof Error ? e.message : "unknown error"}`; if (!(e instanceof Error)) console.error(e); }
  back("/announcements", kind, msg.slice(0, 290));
}
