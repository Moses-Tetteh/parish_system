import "server-only";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAccess, logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/app-settings";
import { formatDate, isValidIsoDate, todayIso } from "@/lib/dates";
import { getMarriage } from "@/lib/matrimony/repository";
import { ForbiddenError } from "@/lib/registers/repository";
import { buildCertificatePdf } from "./pdf";

/**
 * Controlled issuing of certificates (port of CertificateWorkflowService.php):
 *   request (secretary) -> priest sign-off -> issue (PDF)
 * Every certificate records WHO asked, WHY, how long it is valid, who signed it off and who issued it.
 * Sign-off can be switched off by the admin (setting certificate_signoff_required); priests/admins are their
 * own sign-off. No PDF is stored (serverless has no disk): it is built from the record when issued.
 */
export const PURPOSES = [
  "Marriage", "Ordination / Religious Profession", "Passport / Travel / Visa", "School / Admission",
  "Employment", "Legal / Annulment", "Personal Records", "Other",
] as const;
export const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Awaiting sign-off", approved: "Approved — ready to issue", issued: "Issued", rejected: "Rejected",
};
/** Register types that can currently be certified (add a payload builder below to enable another). */
export const REGISTER_LABEL: Record<string, string> = { matrimony: "Holy Matrimony" };
export const REGISTER_HREF: Record<string, (id: number) => string> = { matrimony: (id) => `/matrimony/${id}` };

const ci = schema.certificateIssuances;

export class CertificateError extends Error {}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** A baptismal/marriage certificate for a marriage or ordination is only accepted if recent (default 6 months). */
export async function suggestedValidUntil(purpose: string | null | undefined): Promise<string | null> {
  if (purpose !== "Marriage" && purpose !== "Ordination / Religious Profession") return null;
  const months = Math.max(1, Math.min(60, Number(await getSetting("certificate_marriage_validity_months", "6")) || 6));
  return addMonths(todayIso(), months);
}

export async function signoffRequired(): Promise<boolean> {
  return (await getSetting("certificate_signoff_required", "1")) === "1";
}

export interface CertPayload { label: string; sacrament: string; fields: [string, string][] }

/** The rows printed on the certificate, from the register as it stands now. */
export async function payload(user: SessionUser, type: string, id: number): Promise<CertPayload | null> {
  if (type !== "matrimony") return null;
  const data = await getMarriage(user, id);
  if (!data) return null;
  const { marriage: m, groom, bride } = data;
  const name = (s: typeof groom) => (s ? `${s.given_name ?? ""} ${s.surname ?? ""}`.trim() : "?");
  const recordNo = m.record_no ? String(m.record_no) : "";
  return {
    label: `${name(groom)} & ${name(bride)}${recordNo ? ` (Nus ${recordNo})` : ""}`,
    sacrament: "Holy Matrimony",
    fields: [
      ["Record No.", recordNo], ["Groom", groom ? name(groom) : ""], ["Bride", bride ? name(bride) : ""],
      ["Date of Marriage", formatDate(m.date_of_marriage as string | null)], ["Place of Marriage", String(m.place_of_marriage ?? "")],
      ["Minister", String(m.minister ?? "")], ["Witnesses", String(m.witnesses ?? "")],
    ],
  };
}

export interface RequestInput { type: string; recordId: number; requesterName: string; idShown: string; purpose: string; validUntil: string }

export async function requestCertificate(user: SessionUser, input: RequestInput): Promise<{ id: number; approved: boolean }> {
  if (!roleCan(user.role, "registers")) throw new ForbiddenError();
  const name = input.requesterName.trim();
  if (!name) throw new CertificateError("Enter the requester’s name.");
  if (name.length > 150) throw new CertificateError("The requester’s name is too long.");
  if (!(PURPOSES as readonly string[]).includes(input.purpose)) throw new CertificateError("Choose the purpose of the certificate.");
  let valid = input.validUntil.trim();
  if (valid && !isValidIsoDate(valid)) throw new CertificateError("The validity date is not a valid date.");
  if (!valid) valid = (await suggestedValidUntil(input.purpose)) ?? "";

  const p = await payload(user, input.type, input.recordId);
  if (!p) throw new CertificateError("Record not found.");

  const selfApproved = !(await signoffRequired()) || roleCan(user.role, "certificate.approve");
  return db().transaction(async (tx) => {
    const [row] = await tx.insert(ci).values({
      registerType: input.type, recordId: input.recordId, recordLabel: p.label.slice(0, 250), requesterName: name,
      requesterIdShown: input.idShown.trim().slice(0, 100) || null, purpose: input.purpose,
      status: selfApproved ? "approved" : "pending_approval", validUntil: valid || null,
      approvedBy: selfApproved ? user.username : null, approvedAt: selfApproved ? sql`now()` : null,
      requestedAt: sql`now()`, issuedBy: user.username,
    } as never).returning({ id: ci.id });
    await logAudit({ table: "certificate_issuances", recordId: row!.id, action: "create", username: user.username,
      details: { type: input.type, record: input.recordId, purpose: input.purpose, status: selfApproved ? "approved" : "pending_approval" } }, tx);
    return { id: row!.id, approved: selfApproved };
  });
}

/** Priest/admin sign-off. Only a request that is still pending can be decided (so it can never be flipped twice). */
export async function decide(user: SessionUser, id: number, approve: boolean, note = ""): Promise<boolean> {
  if (!roleCan(user.role, "certificate.approve")) throw new ForbiddenError();
  return db().transaction(async (tx) => {
    const rows = await tx.update(ci).set({
      status: approve ? "approved" : "rejected", approvedBy: user.username, approvedAt: sql`now()`, decisionNote: note.trim().slice(0, 300) || null,
    } as never).where(and(eq(ci.id, id), eq(ci.status, "pending_approval"))).returning({ id: ci.id });
    if (!rows.length) return false;
    await logAudit({ table: "certificate_issuances", recordId: id, action: approve ? "approve" : "reject", username: user.username, details: { note } }, tx);
    return true;
  });
}

const refOf = (id: number) => `C-${String(id).padStart(6, "0")}`;

/**
 * Marks an approved request as issued and builds the PDF in ONE transaction: if the PDF cannot be built the
 * request stays "approved" (nothing is consumed), and two people clicking at once cannot issue it twice.
 */
export async function issue(user: SessionUser, id: number): Promise<{ pdf: Uint8Array; filename: string }> {
  if (!roleCan(user.role, "registers")) throw new ForbiddenError();
  const result = await db().transaction(async (tx) => {
    const [row] = await tx.update(ci).set({ status: "issued", issuedBy: user.username, issuedAt: sql`now()` } as never)
      .where(and(eq(ci.id, id), eq(ci.status, "approved"))).returning();
    if (!row) throw new CertificateError("This certificate has not been approved for issue (or was already issued).");

    const p = await payload(user, row.registerType, row.recordId);
    if (!p) throw new CertificateError("The register entry no longer exists.");
    const fields: [string, string][] = [...p.fields, ["Issued for", row.purpose ?? ""]];
    if (row.validUntil) fields.push(["Valid until", formatDate(row.validUntil)]);
    fields.push(["Signed off by", row.approvedBy ?? ""]);

    const pdf = await buildCertificatePdf({
      sacrament: p.sacrament,
      parishName: await getSetting("parish_name", "Blessed Clementina Parish"),
      parishAddress: await getSetting("parish_address", ""),
      fields, issuedOn: formatDate(todayIso()), reference: refOf(row.id),
    });
    await logAudit({ table: "certificate_issuances", recordId: id, action: "issue", username: user.username, details: { type: row.registerType, record: row.recordId } }, tx);
    return { pdf, filename: `${row.registerType}_certificate_${refOf(row.id)}.pdf` };
  });
  await logAccess({ username: user.username, role: user.role, action: "certificate", resource: "certificate_issuances", recordId: id, detail: "issued" });
  return result;
}

export interface LogQuery { q?: string; registerType?: string; status?: string }

export async function listIssuances(user: SessionUser, query: LogQuery) {
  if (!roleCan(user.role, "registers")) throw new ForbiddenError();
  const c: SQL[] = [];
  const q = query.q?.trim();
  if (q) { const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`; c.push(or(ilike(ci.requesterName, like), ilike(ci.recordLabel, like))!); }
  if (query.registerType) c.push(eq(ci.registerType, query.registerType));
  if (query.status && STATUS_LABEL[query.status]) c.push(eq(ci.status, query.status));
  const rows = await db().select().from(ci).where(c.length ? and(...c) : undefined).orderBy(desc(ci.id)).limit(500);
  const [{ n } = { n: 0 }] = await db().select({ n: sql<number>`count(*)` }).from(ci).where(eq(ci.status, "pending_approval"));
  return { rows, pending: Number(n) };
}
