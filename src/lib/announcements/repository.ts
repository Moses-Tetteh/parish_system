import "server-only";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { parseCsv } from "@/lib/import/spreadsheet";
import { getSetting } from "@/lib/app-settings";
import { isCategory } from "./categories";
import { assertGoogleCsvUrl, planSync } from "./sync";
import { sanitizeRich } from "./sanitize";

const A = schema.announcements;
export type Announcement = typeof A.$inferSelect;
export class AnnouncementError extends Error {}
export class AnnouncementForbiddenError extends Error {}

const guard = (u: SessionUser) => { if (!roleCan(u.role, "registers")) throw new AnnouncementForbiddenError(); };

export interface AnnFilters { start?: string; end?: string; category?: string; status?: string; archived?: boolean }

/** Filters on announcement_date (the Mass date it is read), never on created_at (the entry timestamp). */
export async function searchAnnouncements(u: SessionUser, f: AnnFilters, limit = 1000): Promise<Announcement[]> {
  guard(u);
  const w: (SQL | undefined)[] = [
    f.archived ? eq(A.isArchived, 1) : eq(A.isArchived, 0),
    f.start ? gte(A.announcementDate, f.start) : undefined,
    f.end ? lte(A.announcementDate, f.end) : undefined,
    f.category && isCategory(f.category) ? eq(A.category, f.category) : undefined,
    f.status && ["pending", "approved", "rejected"].includes(f.status) ? eq(A.status, f.status) : undefined,
  ];
  return db().select().from(A).where(and(...w)).orderBy(desc(A.announcementDate), desc(A.id)).limit(limit);
}

export async function pendingAnnouncements(u: SessionUser): Promise<Announcement[]> {
  guard(u);
  return db().select().from(A).where(and(eq(A.status, "pending"), eq(A.isArchived, 0))).orderBy(asc(A.announcementDate), asc(A.id));
}

export async function countPending(u: SessionUser): Promise<number> {
  guard(u);
  const [r] = await db().select({ n: sql<number>`count(*)` }).from(A).where(and(eq(A.status, "pending"), eq(A.isArchived, 0)));
  return Number(r?.n ?? 0);
}

export async function getAnnouncement(u: SessionUser, id: number): Promise<Announcement | null> {
  guard(u);
  const [r] = await db().select().from(A).where(eq(A.id, id)).limit(1);
  return r ?? null;
}

export interface AnnInput { category: string; announcementDate: string; title: string; content: string; submittedByName: string | null; submittedByContact: string | null }

/**
 * Create / update. New office entries are trusted (typed by logged-in staff) and approved at once. An EDIT never changes
 * source/status, so a pending public submission can only be approved from the review screen.
 */
export async function saveAnnouncement(u: SessionUser, id: number | null, i: AnnInput): Promise<number> {
  guard(u);
  const content = sanitizeRich(i.content);
  if (!i.title.trim() || !content.replace(/<[^>]*>/g, "").trim()) throw new AnnouncementError("Please fill in the Mass date, title, and announcement text.");
  const values = { category: isCategory(i.category) ? i.category : "notice", announcementDate: i.announcementDate, title: i.title.trim().slice(0, 200), content, submittedByName: i.submittedByName, submittedByContact: i.submittedByContact, updatedBy: u.username };
  return db().transaction(async (tx) => {
    if (id === null) {
      const [r] = await tx.insert(A).values({ ...values, source: "office", status: "approved", createdBy: u.username }).returning({ id: A.id });
      await logAudit({ table: "announcements", recordId: r!.id, action: "create", username: u.username, details: { title: values.title, category: values.category } }, tx);
      return r!.id;
    }
    const rows = await tx.update(A).set(values).where(eq(A.id, id)).returning({ id: A.id });
    if (!rows.length) throw new AnnouncementError("That announcement no longer exists.");
    await logAudit({ table: "announcements", recordId: id, action: "update", username: u.username, details: { title: values.title } }, tx);
    return id;
  });
}

export async function reviewAnnouncement(u: SessionUser, id: number, decision: "approved" | "rejected", notes: string | null): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    const rows = await tx.update(A).set({ status: decision, reviewedBy: u.username, reviewedAt: sql`now()`, reviewNotes: notes, updatedBy: u.username }).where(eq(A.id, id)).returning({ id: A.id });
    if (!rows.length) throw new AnnouncementError("That announcement no longer exists.");
    await logAudit({ table: "announcements", recordId: id, action: decision === "approved" ? "approve" : "reject", username: u.username, details: notes }, tx);
  });
}

export async function setAnnouncementArchived(u: SessionUser, id: number, archived: boolean): Promise<void> {
  guard(u);
  await db().transaction(async (tx) => {
    await tx.update(A).set({ isArchived: archived ? 1 : 0, updatedBy: u.username }).where(eq(A.id, id));
    await logAudit({ table: "announcements", recordId: id, action: archived ? "archive" : "restore", username: u.username }, tx);
  });
}

/** Pulls new Google Form submissions in as PENDING announcements (never straight onto the printed sheet). */
export async function syncGoogleForm(u: SessionUser, today: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
  guard(u);
  const raw = await getSetting("announcements_google_form_csv_url", "");
  if (!raw) throw new AnnouncementError("No Google Form Sync URL is configured yet. Set one under Settings > Announcements.");
  const url = assertGoogleCsvUrl(raw);
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { Accept: "text/csv" } });
  const finalHost = new URL(res.url).hostname;
  if (!res.ok) throw new AnnouncementError(`Google returned HTTP ${res.status} for the sync URL.`);
  if (!(finalHost === "docs.google.com" || finalHost.endsWith(".googleusercontent.com"))) throw new AnnouncementError("The sync URL redirected somewhere unexpected.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > 5 * 1024 * 1024) throw new AnnouncementError("The sheet is larger than 5 MB.");
  const rows = parseCsv(new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, ""));
  const known = new Set((await db().select({ id: A.googleFormResponseId }).from(A).where(sql`${A.googleFormResponseId} is not null`)).map((r) => r.id!));
  const plan = planSync(rows, known, today);
  let imported = 0;
  const errors = [...plan.errors];
  for (const r of plan.rows) {
    try {
      const [ins] = await db().insert(A).values({
        category: r.category, title: r.title, content: r.content, announcementDate: r.announcementDate, submittedByName: r.name, submittedByContact: r.contact,
        source: "google_form", status: "pending", googleFormResponseId: r.responseId, createdBy: u.username, updatedBy: u.username,
      }).returning({ id: A.id });
      await logAudit({ table: "announcements", recordId: ins!.id, action: "create", username: u.username, details: { source: "google_form" } });
      imported++;
    } catch (e) { errors.push(`${r.responseId}: ${e instanceof Error ? e.message : "could not save"}`); }
  }
  return { imported, skipped: plan.skipped + (plan.rows.length - imported), errors };
}
