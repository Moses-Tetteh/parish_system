import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, idleSeconds, signSession, verifySession } from "@/lib/auth/token";

/**
 * Edge middleware: (1) per-request CSP nonce + hardening headers, (2) cheap "is there a valid
 * signed session?" gate, (3) sliding idle-timeout refresh.
 *
 * NOT the security boundary: every page/action/route re-validates the user against the
 * database (lib/auth/session.ts). Middleware is only an early filter.
 */
const PUBLIC_PATHS = ["/login", "/forbidden", "/api/health", "/api/cron", "/robots.txt"];

function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = buildCsp(nonce, dev);
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!claims && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (req.headers.get("x-forwarded-proto") === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  // Register data is personal data: never let browsers/proxies keep it.
  if (!pathname.startsWith("/_next/static")) res.headers.set("Cache-Control", "no-store, private");

  // Sliding refresh once the token is >5 min old (bounded by the absolute expiry inside the token).
  if (claims && Math.floor(Date.now() / 1000) - claims.iat > 300 && claims.abs > Date.now() / 1000) {
    const token = await signSession({ sub: claims.sub, ph: claims.ph, abs: claims.abs });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
      path: "/",
      maxAge: idleSeconds(),
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
