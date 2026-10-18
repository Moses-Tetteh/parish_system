import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { purgeExpiredRateLimits } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false; // never run unauthenticated
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Daily Vercel Cron: keeps the (free-tier) Supabase project from auto-pausing and purges stale limiter rows. */
export async function GET(req: Request) {
  if (!authorised(req)) return new NextResponse("Unauthorized", { status: 401 });
  await db().execute(sql`select 1`);
  await purgeExpiredRateLimits();
  return NextResponse.json({ ok: true });
}
