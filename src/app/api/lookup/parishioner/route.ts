import { NextResponse } from "next/server";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/** Census name search for the picker. Staff with register access only; returns just id + name + one hint, capped at 15 rows. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!roleCan(user.role, "registers")) return new NextResponse("Forbidden", { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json([]);
  const P = schema.parishioners;
  const rows = await db().select({ id: P.id, name: P.fullName, residence: P.residence, year: P.dateOfBirthYear }).from(P)
    .where(and(eq(P.isArchived, 0), ilike(P.fullName, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`))).orderBy(asc(P.fullName)).limit(15);
  return NextResponse.json(rows.map((r) => ({ id: r.id, label: r.name, hint: [r.year && `b. ${r.year}`, r.residence].filter(Boolean).join(" · ") })), { headers: { "Cache-Control": "no-store, private" } });
}
