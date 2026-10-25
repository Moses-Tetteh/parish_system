import { AnnouncementForm } from "@/components/AnnouncementForm";
import { nextSunday } from "@/lib/announcements/categories";
import { todayIso } from "@/lib/dates";
import { saveAnnouncementAction } from "../actions";

export const metadata = { title: "Add Announcement" };
export default function NewAnnouncement() {
  return (<><h1>Add Announcement</h1><AnnouncementForm action={saveAnnouncementAction.bind(null, null)} initial={{ announcement_date: nextSunday(todayIso()), category: "notice" }} /></>);
}
