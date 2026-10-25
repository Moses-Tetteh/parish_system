import { NextResponse } from "next/server";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/** Baptism-entry search (name or register no.) for the incoming-notice form. Notification staff only. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!roleCan(user.role, "notifications")) return new NextResponse("Forbidden", { status: 403 });
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (term.length < 2) return NextResponse.json([]);
  const B = schema.baptismRecords, like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db().select({ id: B.id, given: B.givenName, surname: B.surname, no: B.recordNo, date: B.dateOfBaptism }).from(B)
    .where(and(eq(B.isArchived, 0), or(ilike(sql`concat(${B.givenName}, ' ', ${B.surname})`, like), ilike(B.recordNo, like)))).orderBy(asc(B.surname), asc(B.givenName)).limit(15);
  return NextResponse.json(rows.map((r) => ({ id: r.id, label: `${r.given ?? ""} ${r.surname ?? ""}`.trim(), hint: [r.no && `No. ${r.no}`, r.date && `bapt. ${r.date}`].filter(Boolean).join(" · ") })), { headers: { "Cache-Control": "no-store, private" } });
}
