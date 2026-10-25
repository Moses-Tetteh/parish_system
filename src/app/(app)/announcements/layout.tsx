import { requirePermission } from "@/lib/auth/session";
import { AnnouncementTabs } from "@/components/AnnouncementTabs";

export default async function AnnouncementsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("registers");
  return (<><AnnouncementTabs tabs={[{ href: "/announcements", label: "All Announcements" }, { href: "/announcements/print", label: "Print / PDF" }, { href: "/announcements/review", label: "Pending Review" }]} />{children}</>);
}
