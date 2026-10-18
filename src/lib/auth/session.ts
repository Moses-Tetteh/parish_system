import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { SESSION_COOKIE, idleSeconds, newAbsoluteExpiry, signSession, verifySession } from "./token";
import { passwordFingerprint } from "./password";
import { isRole, roleCan, type Permission, type Role } from "./permissions";

export interface SessionUser {
  id: number;
  username: string;
  fullName: string | null;
  role: Role;
}

/** Resolve + validate the current user ONCE per request. Never trusts the token's contents beyond the id. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const id = Number(claims.sub);
  if (!Number.isInteger(id)) return null;

  const [row] = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  // Re-checked on every request so deactivation / role change / password change bite immediately.
  if (!row || row.isActive !== 1 || !isRole(row.role)) return null;
  if (claims.ph !== passwordFingerprint(row.passwordHash)) return null;

  return { id: row.id, username: row.username, fullName: row.fullName ?? null, role: row.role };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleCan(user.role, permission)) redirect("/forbidden");
  return user;
}

export async function can(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && roleCan(user.role, permission);
}

async function shouldUseSecureCookie(): Promise<boolean> {
  const mode = env().COOKIE_SECURE;
  if (mode === "always") return true;
  if (mode === "never") return false;
  const h = await headers();
  return (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim() === "https";
}

export async function startSession(user: { id: number; passwordHash: string }): Promise<void> {
  const token = await signSession({
    sub: String(user.id),
    ph: passwordFingerprint(user.passwordHash),
    abs: newAbsoluteExpiry(),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await shouldUseSecureCookie(),
    path: "/",
    maxAge: idleSeconds(),
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
