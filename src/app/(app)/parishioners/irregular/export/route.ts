import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { logAccess } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { irregularUnions } from "@/lib/parishioners/tools";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!roleCan(user.role, "sensitive.irregular")) return new NextResponse("Forbidden", { status: 403 });
  const rows = await irregularUnions(user);
  await logAccess({ username: user.username, role: user.role, action: "export", resource: "irregular_unions", detail: `${rows.length} rows` });
  const csv = toCsv(["Name", "Outstation", "Phone", "Marital status", "Spouse", "Practising"], rows.map(({ p, outstation }) => [p.fullName, outstation, p.phone, p.maritalStatus, p.spouseName, p.practisingStatus]));
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="marriages_to_regularise_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv"`, "Cache-Control": "no-store, private" } });
}
