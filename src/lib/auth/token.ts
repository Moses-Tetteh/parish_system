/**
 * Session token (signed JWT). Deliberately free of `server-only`/Node APIs so the
 * Edge middleware and Node server code share ONE implementation.
 */
import { SignJWT, jwtVerify } from "jose";

/** "__Host-" prefix (Secure, Path=/, no Domain) makes the cookie un-overwritable by sibling subdomains. Needs HTTPS => only with COOKIE_SECURE=always (production on Vercel). */
export const SESSION_COOKIE = process.env.COOKIE_SECURE === "always" ? "__Host-parish_session" : "parish_session";
export const ABSOLUTE_SESSION_HOURS = 12;

export interface SessionClaims {
  sub: string; // user id
  ph: string; // fingerprint of password hash -> changing password revokes old sessions
  abs: number; // absolute expiry (epoch seconds) - sliding refresh can never exceed this
}

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export function idleSeconds(): number {
  const minutes = Number(process.env.SESSION_IDLE_MINUTES ?? 120);
  return (Number.isFinite(minutes) && minutes >= 5 ? minutes : 120) * 60;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(now + idleSeconds(), claims.abs);
  return new SignJWT({ ph: claims.ph, abs: claims.abs })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<(SessionClaims & { iat: number }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.ph !== "string" || typeof payload.abs !== "number") return null;
    return { sub: payload.sub, ph: payload.ph, abs: payload.abs, iat: payload.iat ?? 0 };
  } catch {
    return null;
  }
}

export function newAbsoluteExpiry(): number {
  return Math.floor(Date.now() / 1000) + ABSOLUTE_SESSION_HOURS * 3600;
}
