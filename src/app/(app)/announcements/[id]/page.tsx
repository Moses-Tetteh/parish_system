import { notFound } from "next/navigation";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { requirePermission } from "@/lib/auth/session";
import { getAnnouncement } from "@/lib/announcements/repository";
import { sanitizeRich } from "@/lib/announcements/sanitize";
import { saveAnnouncementAction } from "../actions";

export const metadata = { title: "Edit Announcement" };
export const dynamic = "force-dynamic";
export default async function EditAnnouncement({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("registers");
  const { id: raw } = await params;
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const a = await getAnnouncement(user, Number(raw));
  if (!a) notFound();
  return (
    <>
      <h1>Edit Announcement</h1>
      {a.status === "pending" && <div className="callout callout-warning">This is a public submission still waiting for review. Editing it does not approve it — use the Pending Review tab.</div>}
      <AnnouncementForm action={saveAnnouncementAction.bind(null, a.id)} initial={{ category: a.category, announcement_date: a.announcementDate, title: a.title, content: sanitizeRich(a.content), submitted_by_name: a.submittedByName ?? "", submitted_by_contact: a.submittedByContact ?? "" }} />
    </>
  );
}
