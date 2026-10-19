import { notFound } from "next/navigation";
import { CertificateRequestForm } from "@/components/CertificateRequestForm";
import { requirePermission } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { PURPOSES, payload, signoffRequired, suggestedValidUntil } from "@/lib/certificates/workflow";
import { requestCertificateAction } from "../../../certificates/actions";

export const metadata = { title: "Certificate — Request" };
export const dynamic = "force-dynamic";

export default async function MarriageCertificate({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id)) notFound();
  const user = await requirePermission("registers");
  const p = await payload(user, "matrimony", id);
  if (!p) notFound();
  const needsSignoff = (await signoffRequired()) && !roleCan(user.role, "certificate.approve");

  return (
    <>
      <h1>Request a Certificate</h1>
      <div className="card" style={{ maxWidth: 640 }}>
        <p><strong>{p.sacrament}:</strong> {p.label}</p>
        <p className="hint">
          Every certificate is logged with who asked, why, how long it is valid and who signed it off.{" "}
          {needsSignoff ? "It will be issued after the priest’s sign-off." : "You can sign this off yourself, so it will be issued immediately."}
        </p>
      </div>
      <CertificateRequestForm
        action={requestCertificateAction.bind(null, "matrimony", id)}
        purposes={PURPOSES}
        needsSignoff={needsSignoff}
        suggestedValidUntil={(await suggestedValidUntil("Marriage")) ?? ""}
        backHref="/matrimony"
      />
    </>
  );
}
