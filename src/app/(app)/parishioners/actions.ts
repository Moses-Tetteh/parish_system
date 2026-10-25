"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { back, intOf } from "@/lib/forms";
import { runFullSync } from "@/lib/parishioners/sync";
import { ToolForbiddenError, ToolInputError, dismissPair, importHouseholdMembers, mergeAllCertain, mergeParishioners } from "@/lib/parishioners/tools";

function msg(e: unknown, fallback: string): string {
  if (e instanceof ToolForbiddenError) redirect("/forbidden");
  if (e instanceof ToolInputError) return e.message;
  console.error("parishioner tool failed", e);
  return fallback;
}

export async function mergeAction(fd: FormData): Promise<void> {
  const user = await requirePermission("registers");
  const a = intOf(fd, "a"), b = intOf(fd, "b"), keep = intOf(fd, "keep");
  if (!a || !b) back("/parishioners/duplicates", "error", "Choose two people to merge.");
  try { const r = await mergeParishioners(user, a!, b!, keep); back("/parishioners/duplicates", "ok", `Merged into ${r.name} (#${r.kept}); duplicate #${r.absorbed} was archived.`); }
  catch (e) { back("/parishioners/duplicates", "error", msg(e, "The merge could not be completed and nothing was changed.")); }
}

export async function mergeAllAction(): Promise<void> {
  const user = await requirePermission("registers");
  try {
    const r = await mergeAllCertain(user);
    back("/parishioners/duplicates", r.errors.length ? "error" : "ok", `${r.merged} duplicate${r.merged === 1 ? "" : "s"} merged${r.left ? `, ${r.left} still need a manual look` : ""}.${r.errors.length ? ` ${r.errors.slice(0, 3).join(" | ")}` : ""}`.slice(0, 290));
  } catch (e) { back("/parishioners/duplicates", "error", msg(e, "The bulk merge could not finish.")); }
}

export async function dismissAction(fd: FormData): Promise<void> {
  const user = await requirePermission("registers");
  const a = intOf(fd, "a"), b = intOf(fd, "b");
  if (!a || !b) back("/parishioners/duplicates", "error", "Invalid pair.");
  try { await dismissPair(user, a!, b!); } catch (e) { back("/parishioners/duplicates", "error", msg(e, "Could not record that decision.")); }
  back("/parishioners/duplicates", "ok", "Noted: these are different people and will not be suggested again.");
}

export async function syncApplyAction(): Promise<void> {
  const user = await requirePermission("registers");
  let text: string, review = false;
  try {
    const r = await runFullSync(user.username, true);
    review = r.flagged > 0;
    text = `Sync finished: ${r.created} added, ${r.linked} linked, ${r.updated} completed${r.flagged ? `, ${r.flagged} flagged to check` : ""}.${r.errors ? ` ${r.errors} register entries could not be processed.` : ""}`;
  } catch (e) { console.error("sync failed", e); back("/parishioners/sync", "error", "The sync could not finish and nothing was changed. Please try again, or tell the administrator."); }
  redirect(`/registers/parishioners?ok=${encodeURIComponent(text!)}${review ? "&quality=review" : ""}`);
}

export async function importHouseholdsAction(fd: FormData): Promise<void> {
  const user = await requirePermission("registers");
  const ids = fd.getAll("ids").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  let n: number;
  try { n = await importHouseholdMembers(user, ids); } catch (e) { back("/parishioners/import-households", "error", msg(e, "Could not import the selected people.")); }
  redirect(`/registers/parishioners?ok=${encodeURIComponent(`${n!} parishioner${n! === 1 ? "" : "s"} added. Open each one to complete their parents, birth date and sacraments.`)}`);
}
