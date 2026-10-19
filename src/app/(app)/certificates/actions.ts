"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/registers/repository";
import { CertificateError, decide, requestCertificate } from "@/lib/certificates/workflow";

export interface CertState { error?: string; issueId?: number }

/** Request a certificate. Self-approved requests (priest/admin, or sign-off switched off) hand back an id so the
 *  page can offer the "issue PDF" button; everything else waits for the priest in the Certificate Log. */
export async function requestCertificateAction(type: string, recordId: number, _prev: CertState, fd: FormData): Promise<CertState> {
  const user = await requirePermission("registers");
  let issueId: number | undefined;
  try {
    const r = await requestCertificate(user, {
      type, recordId,
      requesterName: String(fd.get("requester_name") ?? ""), idShown: String(fd.get("requester_id_shown") ?? ""),
      purpose: String(fd.get("purpose") ?? ""), validUntil: String(fd.get("valid_until") ?? ""),
    });
    if (r.approved) issueId = r.id;
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/forbidden");
    if (e instanceof CertificateError) return { error: e.message };
    console.error("requestCertificate failed", e);
    return { error: "Could not record the request. Please try again." };
  }
  if (issueId !== undefined) return { issueId };
  redirect("/certificates?status=pending_approval&requested=1");
}

export async function decideCertificateAction(id: number, approve: boolean): Promise<void> {
  const user = await requirePermission("certificate.approve");
  await decide(user, id, approve);
  revalidatePath("/certificates");
  redirect(`/certificates?status=pending_approval&decided=${approve ? "approved" : "rejected"}`);
}
