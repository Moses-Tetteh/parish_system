"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/registers/repository";
import { parseForm, type FieldErrors, type Values } from "@/lib/registers/validation";
import type { FormState } from "@/lib/registers/form-model";
import { MARRIAGE_DEF, ROLE_LABEL, SPOUSE_DEF, SPOUSE_ROLES, type SpouseRole } from "@/lib/matrimony/fields";
import { MarriageRuleError, saveMarriage, setMarriageArchived } from "@/lib/matrimony/repository";

function echo(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

/** The groom / bride panels post as groom_given_name, bride_given_name ...; strip the prefix so the
 *  normal field validation (types, lengths, baptism-number lookup) can be reused unchanged. */
function spouseSlice(fd: FormData, role: SpouseRole): FormData {
  const sub = new FormData();
  for (const [k, v] of fd.entries()) if (k.startsWith(`${role}_`) && typeof v === "string") sub.append(k.slice(role.length + 1), v);
  return sub;
}

export async function saveMarriageAction(id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("registers");

  const marriage = await parseForm(MARRIAGE_DEF, user.role, fd);
  const errors: FieldErrors = { ...marriage.errors };
  const spouseValues: Record<SpouseRole, Values> = { groom: {}, bride: {} };
  for (const role of SPOUSE_ROLES) {
    const r = await parseForm(SPOUSE_DEF, user.role, spouseSlice(fd, role));
    spouseValues[role] = r.values;
    for (const [k, msg] of Object.entries(r.errors)) errors[`${role}_${k}`] = `${ROLE_LABEL[role]}: ${msg}`;
  }
  if (Object.keys(errors).length) return { errors, values: echo(fd), message: "Please fix the highlighted fields." };
  if (!marriage.values.marriage_type) marriage.values.marriage_type = "catholic"; // column is NOT NULL, default Catholic

  let destination: string;
  try {
    const version = id !== null && fd.has("_version") ? String(fd.get("_version")) : undefined;
    const result = await saveMarriage(user, id, { marriage: marriage.values, groom: spouseValues.groom, bride: spouseValues.bride, version });
    if (result === "conflict") {
      return { values: echo(fd), message: "Someone else saved this marriage record while you were editing it (or it was removed). Reload the page to see their changes, then re-apply yours." };
    }
    const sy = result.sync;
    destination = `/matrimony?saved=1${sy ? `&pc=${sy.created}&pl=${sy.linked + sy.updated}&pf=${sy.flagged}` : "&pc=x"}`;
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/forbidden");
    if (e instanceof MarriageRuleError) return { values: echo(fd), errors: e.field ? { [e.field]: e.message } : undefined, message: e.message };
    console.error("saveMarriage failed", e);
    return { values: echo(fd), message: "Could not save the marriage record. Nothing was lost — please try again." };
  }
  redirect(destination); // outside the try: redirect() works by throwing
}

export async function archiveMarriageAction(id: number, archived: boolean): Promise<void> {
  const user = await requirePermission("registers");
  await setMarriageArchived(user, id, archived);
  redirect(`/matrimony${archived ? "" : "?archived=1"}`);
}
