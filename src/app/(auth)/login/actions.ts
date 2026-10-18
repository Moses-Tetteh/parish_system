"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { clientIp, logAccess } from "@/lib/audit";
import { rateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const GENERIC = "Invalid username or password.";

const input = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

export interface LoginState { error?: string }

/** Only same-site relative paths are honoured => no open redirect. */
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return /^\/(?!\/)[A-Za-z0-9/_\-?=&%.]*$/.test(v) && !v.startsWith("/login") ? v : "/dashboard";
}

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = input.safeParse({ username: fd.get("username"), password: fd.get("password") });
  if (!parsed.success) return { error: GENERIC };
  const { username, password } = parsed.data;

  const ip = await clientIp();
  // Two independent throttles: per IP (spray attacks) and per username (targeted guessing; also DB lockout below).
  const byIp = await rateLimit(`login:ip:${ip}`, 20, 10 * 60_000);
  const byUser = await rateLimit(`login:user:${username.toLowerCase()}`, 10, 10 * 60_000);
  if (!byIp.ok || !byUser.ok) return { error: "Too many attempts. Please wait a few minutes and try again." };

  const [found] = await db()
    .select({ u: schema.users, locked: sql<number>`(${schema.users.lockedUntil} IS NOT NULL AND ${schema.users.lockedUntil} > now())::int` })
    .from(schema.users).where(eq(schema.users.username, username)).limit(1);
  const user = found?.u;

  if (user && Number(found?.locked) === 1) {
    await logAccess({ username, role: user.role, action: "login_blocked", resource: "auth" });
    return { error: "This account is temporarily locked after repeated failed attempts. Try again later." };
  }

  // Always run a bcrypt comparison (dummy hash if no such user) => constant-ish timing.
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || user.isActive !== 1) {
    if (user) {
      await db().update(schema.users).set({
        failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
        lockedUntil: sql`CASE WHEN ${schema.users.failedLoginAttempts} + 1 >= ${MAX_ATTEMPTS} THEN now() + make_interval(mins => ${LOCK_MINUTES}) ELSE ${schema.users.lockedUntil} END`,
      }).where(eq(schema.users.id, user.id));
    }
    await logAccess({ username, role: user?.role ?? null, action: "login_failed", resource: "auth" });
    return { error: GENERIC };
  }

  await db().update(schema.users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, user.id));
  await startSession({ id: user.id, passwordHash: user.passwordHash });
  await logAccess({ username: user.username, role: user.role, action: "login", resource: "auth" });
  redirect(safeNext(fd.get("next")));
}
