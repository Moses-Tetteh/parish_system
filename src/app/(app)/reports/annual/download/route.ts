import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { logAccess } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { getSetting } from "@/lib/app-settings";
import { todayIso } from "@/lib/dates";
import { buildReportPdf } from "@/lib/pdf/report";
import { buildAnnualReport, canIncludeFinance } from "@/lib/reports/annual";
import { loadSnapshot } from "@/lib/reports/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!roleCan(user.role, "reports.annual")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams, format = q.get("format");
  const fin = canIncludeFinance(user), snap = Number(q.get("snapshot")) || 0;
  const y = Number(q.get("year")), year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : Number(todayIso().slice(0, 4));
  const report = snap ? await loadSnapshot(snap, fin) : await buildAnnualReport(year, fin);
  if (!report) return new NextResponse("Not found", { status: 404 });
  await logAccess({ username: user.username, role: user.role, action: "export", resource: "annual_report", detail: `${report.year} ${format}` });

  if (format === "csv") {
    const rows = report.sections.flatMap((s) => s.rows.map((r) => [s.title, r[0], String(r[1]), r[2] ?? ""]));
    return new NextResponse(toCsv(["Section", "Item", "Value", "Note"], rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="annual_report_${report.year}.csv"`, "Cache-Control": "no-store, private" } });
  }
  if (format === "pdf") {
    if (!roleCan(user.role, "export")) return new NextResponse("Forbidden", { status: 403 });
    const bytes = await buildReportPdf({
      parishName: await getSetting("parish_name", "Blessed Clementina Parish"), title: `Annual Statistical Report ${report.year}`,
      columns: [{ header: "Item", weight: 50 }, { header: "Value", weight: 15, align: "right" }, { header: "Note", weight: 35 }],
      rows: report.sections.flatMap((s) => [{ cells: [s.title, "", ""], bold: true, shade: true }, ...s.rows.map((r) => ({ cells: [r[0], String(r[1]), r[2] ?? ""] }))]),
    });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="annual_report_${report.year}.pdf"`, "Cache-Control": "no-store, private" } });
  }
  return new NextResponse("Unknown format", { status: 400 });
}
