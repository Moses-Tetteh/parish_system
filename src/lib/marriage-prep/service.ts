import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema, type Executor } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { getRegister } from "@/lib/registers/registry";
import { saveMarriage } from "@/lib/matrimony/repository";
import { BANNS_LABELS, approvalBlockers, bannsAnnouncement, bannsDates, deriveStatus, requiredDispensation, splitName } from "./rules";

const MP = schema.marriagePreparations, A = schema.announcements;
export type Prep = typeof MP.$inferSelect;
export class PrepError extends Error {}
export class PrepForbiddenError extends Error {}

const need = (u: SessionUser, p: "registers" | "marriage.approve") => { if (!roleCan(u.role, p)) throw new PrepForbiddenError(); };
const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

export async function getPrep(u: SessionUser, id: number, ex: Executor = db()): Promise<Prep | null> {
  need(u, "registers");
  const [r] = await ex.select().from(MP).where(eq(MP.id, id)).limit(1);
  return r ?? null;
}

/** Keeps the derived status right and the Sunday announcements in step with the banns dates. Call inside the saving transaction. */
export async function recalculate(tx: Executor, id: number, username: string): Promise<void> {
  const [p] = await tx.select().from(MP).where(eq(MP.id, id)).limit(1);
  if (!p) return;
  const status = deriveStatus(p);
  if (status !== p.status) await tx.update(MP).set({ status }).where(eq(MP.id, id));
  await syncBannsAnnouncements(tx, { ...p, status }, username);
}

/**
 * One announcement per publication (1st/2nd/3rd), created from the dates, moved when a date changes, and archived when the
 * date is cleared, the file is cancelled, or the wedding is recorded. They are approved at once: the priest approves the FILE.
 */
export async function syncBannsAnnouncements(tx: Executor, p: Prep, username: string): Promise<void> {
  const live = p.status !== "cancelled" && !p.matrimonyId;
  for (const n of [1, 2, 3] as const) {
    const refType = `marriage_prep_${n}`;
    const date = p[`banns${n}Date` as "banns1Date"];
    const [existing] = await tx.select({ id: A.id }).from(A).where(and(eq(A.refType, refType), eq(A.refId, p.id))).limit(1);
    if (!live || !date) {
      if (existing) await tx.update(A).set({ isArchived: 1, updatedBy: username }).where(eq(A.id, existing.id));
      continue;
    }
    const { title, html } = bannsAnnouncement(n, esc(p.groomName), p.groomDomicile ? esc(p.groomDomicile) : null, esc(p.brideName), p.brideDomicile ? esc(p.brideDomicile) : null);
    if (existing) await tx.update(A).set({ title, content: html, announcementDate: date, isArchived: 0, updatedBy: username }).where(eq(A.id, existing.id));
    else await tx.insert(A).values({ category: "publication_of_banns", title, content: html, announcementDate: date, source: "marriage_prep", status: "approved", refType, refId: p.id, createdBy: username, updatedBy: username });
  }
}

/** After a save through the generic register form. Returns advisory notes to show the user (never blocks the save). */
export async function afterPrepSave(user: SessionUser, id: number): Promise<string[]> {
  const notes: string[] = [];
  await db().transaction(async (tx) => { await recalculate(tx, id, user.username); });
  const p = await getPrep(user, id);
  if (p) {
    const need = requiredDispensation(p);
    if (need !== "none" && (p.dispensationType ?? "none") === "none" && roleCan(user.role, "sensitive.dispensation")) {
      notes.push(`One spouse is not Catholic — record the ${need === "mixed_religion" ? "permission for a mixed marriage" : "dispensation from disparity of cult"}.`);
    }
  }
  return notes;
}

async function audit(tx: Executor, id: number, action: "approve" | "update" | "create", username: string, details: string) {
  await logAudit({ table: "marriage_preparations", recordId: id, action, username, details }, tx);
}

export async function approve(user: SessionUser, id: number): Promise<void> {
  need(user, "marriage.approve");
  await db().transaction(async (tx) => {
    const [p] = await tx.select().from(MP).where(eq(MP.id, id)).for("update");
    if (!p) throw new PrepError("File not found.");
    const blockers = approvalBlockers(p);
    if (blockers.length) throw new PrepError(`Cannot approve yet — ${blockers.join(" ")}`);
    await tx.update(MP).set({ approvedBy: user.username, approvedAt: new Date().toISOString(), updatedBy: user.username }).where(eq(MP.id, id));
    await audit(tx, id, "approve", user.username, "approved");
    await recalculate(tx, id, user.username);
  });
}

export async function withdrawApproval(user: SessionUser, id: number): Promise<void> {
  need(user, "marriage.approve");
  await db().transaction(async (tx) => {
    await tx.update(MP).set({ approvedBy: null, approvedAt: null, updatedBy: user.username }).where(and(eq(MP.id, id), isNull(MP.matrimonyId)));
    await audit(tx, id, "update", user.username, "withdraw_approval");
    await recalculate(tx, id, user.username);
  });
}

export async function cancelOrReopen(user: SessionUser, id: number, reopen: boolean): Promise<void> {
  need(user, "registers");
  await db().transaction(async (tx) => {
    const [p] = await tx.select({ matrimonyId: MP.matrimonyId }).from(MP).where(eq(MP.id, id)).for("update");
    if (!p) throw new PrepError("File not found.");
    if (p.matrimonyId) throw new PrepError("This file is already recorded in the Matrimony register.");
    await tx.update(MP).set({ status: reopen ? "inquiry" : "cancelled", updatedBy: user.username }).where(eq(MP.id, id));
    await audit(tx, id, "update", user.username, reopen ? "reopen" : "cancel");
    await recalculate(tx, id, user.username);
  });
}

export interface Wedding { dateOfMarriage: string; placeOfMarriage: string | null; minister: string | null; witnesses: string | null; recordNo: string | null }

/** Creates the Matrimony register entry (with both spouses, marginal notes and parishioner sync via saveMarriage) from an approved file. */
export async function convertToMatrimony(user: SessionUser, id: number, w: Wedding): Promise<number> {
  need(user, "registers");
  const p = await getPrep(user, id);
  if (!p) throw new PrepError("File not found.");
  if (p.matrimonyId) throw new PrepError("This file has already been entered in the Matrimony register.");
  if (!p.approvedAt) throw new PrepError("The priest must approve the marriage before it can be recorded as celebrated.");

  const type = requiredDispensation(p);
  const marriageType = p.dispensationType === "disparity_of_cult" || type === "disparity_of_cult" ? "disparity_of_cult" : p.dispensationType === "mixed_religion" || type === "mixed_religion" ? "mixed_religion" : "catholic";
  let banns = bannsDates(p).map(formatDate).join(", ");
  if (p.bannsDispensed) banns = `${banns} (banns dispensed by the Ordinary)`.trim();
  const dispLabels = getRegister("marriage_prep")?.fields.find((f) => f.key === "dispensation_type")?.options ?? {};
  const dispensation = (p.dispensationType ?? "none") !== "none" ? `${dispLabels[p.dispensationType!] ?? ""}${p.dispensationRef ? ` — ref. ${p.dispensationRef}` : ""}` : null;
  const spouse = (name: string, domicile: string | null, place: string | null, baptismId: number | null) => {
    const [given, surname] = splitName(name);
    return { given_name: given, surname, domicile, baptism_place: place, baptism_register_ref: baptismId };
  };
  const saved = await saveMarriage(user, null, {
    marriage: {
      record_no: w.recordNo, date_of_marriage: w.dateOfMarriage, place_of_marriage: w.placeOfMarriage ?? p.placeOfMarriage ?? null, banns_published_dates: banns || null,
      dispensation, marriage_type: marriageType, minister: w.minister ?? p.officiatingMinister ?? null, witnesses: w.witnesses ?? p.witnesses ?? null,
    },
    groom: spouse(p.groomName, p.groomDomicile, p.groomBaptismPlace, p.groomBaptismId),
    bride: spouse(p.brideName, p.brideDomicile, p.brideBaptismPlace, p.brideBaptismId),
  });
  if (saved === "conflict") throw new PrepError("The marriage could not be recorded. Please try again.");
  await db().transaction(async (tx) => {
    await tx.update(MP).set({ matrimonyId: saved.id, status: "married", updatedBy: user.username }).where(eq(MP.id, id));
    await audit(tx, id, "update", user.username, `convert to matrimony #${saved.id}`);
    await recalculate(tx, id, user.username);
  });
  return saved.id;
}

export { BANNS_LABELS };
