import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CertificateError, issue } from "@/lib/certificates/workflow";
import { ForbiddenError } from "@/lib/registers/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Same-origin check for a plain HTML form POST (Server Actions get this from Next; a route handler must do it itself). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * Issues an approved certificate and streams the PDF back (opens in a new tab from the form).
 * POST only, because issuing changes state; a second click cannot issue it twice (status moves approved -> issued once).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  const { id: raw } = await params;
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id)) return new NextResponse("Not found", { status: 404 });

  try {
    const { pdf, filename } = await issue(user, id);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse("Forbidden", { status: 403 });
    const msg = e instanceof CertificateError ? e.message : "Could not issue the certificate.";
    if (!(e instanceof CertificateError)) console.error("issue failed", e);
    return NextResponse.redirect(new URL(`/certificates?error=${encodeURIComponent(msg)}`, req.url), 303);
  }
}
