import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { logAccess } from "@/lib/audit";
import { searchAnnouncements } from "@/lib/announcements/repository";
import { isCategory, nextSunday } from "@/lib/announcements/categories";
import { buildAnnouncementsPdf } from "@/lib/pdf/announcements";
import { getSetting } from "@/lib/app-settings";
import { formatDate, isValidIsoDate, todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!roleCan(user.role, "registers")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const sunday = nextSunday(todayIso());
  const start = isValidIsoDate(q.get("start") ?? "") ? q.get("start")! : sunday, end = isValidIsoDate(q.get("end") ?? "") ? q.get("end")! : sunday;
  const category = isCategory(q.get("category") ?? "") ? q.get("category")! : "";
  const rows = await searchAnnouncements(user, { start, end, category, status: "approved" });
  const bytes = await buildAnnouncementsPdf({ parishName: await getSetting("parish_name", "Blessed Clementina Parish"), start, end, categoryFilter: category, items: rows, generatedOn: formatDate(todayIso()) });
  await logAccess({ username: user.username, role: user.role, action: "export", resource: "announcements", detail: `${start}..${end}${category ? ` ${category}` : ""}` });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="announcements_${start}.pdf"`, "Cache-Control": "no-store, private" } });
}
