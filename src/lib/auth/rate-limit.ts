import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Fixed-window limiter stored in Postgres (table `rate_limits`) so it is shared by every serverless
 * instance. One atomic UPSERT per check => no race conditions. Fails OPEN on database errors so an
 * outage of the limiter never locks the parish out (the per-account DB lockout still applies).
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSec: number }> {
  try {
    const seconds = Math.ceil(windowMs / 1000);
    const rows = await db().execute<{ count: number; wait: number }>(sql`
      insert into rate_limits as r (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${seconds}))
      on conflict (key) do update set
        count    = case when r.reset_at < now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at < now() then now() + make_interval(secs => ${seconds}) else r.reset_at end
      returning count, greatest(1, ceil(extract(epoch from (reset_at - now()))))::int as wait`);
    const row = rows[0];
    if (!row) return { ok: true, retryAfterSec: 0 };
    return Number(row.count) > limit ? { ok: false, retryAfterSec: Number(row.wait) } : { ok: true, retryAfterSec: 0 };
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "rate limiter unavailable", err: String(e) }));
    return { ok: true, retryAfterSec: 0 };
  }
}

/** Housekeeping, called opportunistically from the cron endpoint. */
export async function purgeExpiredRateLimits(): Promise<void> {
  await db().execute(sql`delete from rate_limits where reset_at < now() - interval '1 day'`);
}
