import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { toCsv, safeFilename } from "@/lib/csv";
import { getRegister } from "@/lib/registers/registry";
import { exportRows } from "@/lib/registers/repository";
import { displayValue } from "@/lib/registers/view";
import { isValidIsoDate, todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getRegister(key);
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!def || def.export === false || !roleCan(user.role, def.permission) || !roleCan(user.role, "export")) return new NextResponse("Forbidden", { status: 403 });

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  const rows = await exportRows(def, user, {
    q: sp.get("q") ?? undefined,
    archived: sp.get("archived") === "1",
    filters: Object.fromEntries((def.filters ?? []).map((f) => [f, sp.get(f) ?? ""])),
    from: isValidIsoDate(from) ? from : undefined, to: isValidIsoDate(to) ? to : undefined,
  });

  // Fields the role may not see are blanked in exports as well.
  const fields = def.fields.filter((f) => f.type !== "section" && (!f.permission || roleCan(user.role, f.permission)));
  const csv = toCsv(fields.map((f) => f.label), rows.map((r) => fields.map((f) => displayValue(def, f, r))));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(`${def.key}_${todayIso()}.csv`)}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
