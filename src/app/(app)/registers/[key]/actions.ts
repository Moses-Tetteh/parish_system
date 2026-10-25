"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getRegister } from "@/lib/registers/registry";
import { createRecord, deleteRecord, findPossibleDuplicates, setArchived, updateRecord, ForbiddenError } from "@/lib/registers/repository";
import { parseForm } from "@/lib/registers/validation";
import { HookError, runAfterSave, runBeforeSave } from "@/lib/registers/hooks";
import type { FormState } from "@/lib/registers/form-model";

function echo(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

export async function saveRecordAction(key: string, id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const def = getRegister(key);
  if (!def) return { message: "Unknown register." };
  const user = await requirePermission(def.permission);

  const { values, errors } = await parseForm(def, user.role, fd);
  if (Object.keys(errors).length) return { errors, values: echo(fd), message: "Please fix the highlighted fields." };

  let warnings: string[] = [];
  try { warnings = await runBeforeSave(key, values, id); }
  catch (e) { if (e instanceof HookError) return { values: echo(fd), message: e.message }; throw e; }

  let savedId = id;
  try {
    if (id === null) {
      if (fd.get("confirm_duplicate") !== "1") {
        const dups = await findPossibleDuplicates(def, values);
        if (dups.length) return { values: echo(fd), duplicates: dups, message: "A record with the same name already exists." };
      }
      savedId = await createRecord(def, user, values);
    } else {
      const version = fd.has("_version") ? String(fd.get("_version")) : undefined;
      if ((await updateRecord(def, user, id, values, version)) === "conflict") {
        return { values: echo(fd), message: "Someone else saved this record while you were editing it (or it was removed). Reload the page to see their changes, then re-apply yours." };
      }
    }
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/forbidden");
    console.error("saveRecord failed", e);
    return { values: echo(fd), message: "Could not save. Nothing was lost — please try again." };
  }
  const notes = [...warnings, ...(await runAfterSave(key, user, savedId!))];
  redirect(`/registers/${key}?saved=1${notes.length ? `&note=${encodeURIComponent(notes.join(" ⚠ ").slice(0, 600))}` : ""}`);
}

export async function archiveAction(key: string, id: number, archived: boolean): Promise<void> {
  const def = getRegister(key);
  if (!def) return;
  const user = await requirePermission(def.permission);
  await setArchived(def, user, id, archived);
  redirect(`/registers/${key}${archived ? "" : "?archived=1"}`);
}

export async function deleteAction(key: string, id: number): Promise<void> {
  const def = getRegister(key);
  if (!def) return;
  const user = await requirePermission(def.permission);
  try { await deleteRecord(def, user, id); } catch (e) { if (e instanceof ForbiddenError) redirect("/forbidden"); throw e; }
  redirect(`/registers/${key}?deleted=1`);
}
