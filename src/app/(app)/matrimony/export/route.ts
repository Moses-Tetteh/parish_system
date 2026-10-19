import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { isValidIsoDate, todayIso, formatDate } from "@/lib/dates";
import { toCsv, safeFilename } from "@/lib/csv";
import { exportMarriages } from "@/lib/matrimony/repository";
import { MARRIAGE_DEF } from "@/lib/matrimony/fields";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!roleCan(user.role, "registers") || !roleCan(user.role, "export")) return new NextResponse("Forbidden", { status: 403 });

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  const rows = await exportMarriages(user, {
    q: sp.get("q") ?? undefined, type: sp.get("type") ?? undefined, archived: sp.get("archived") === "1",
    from: isValidIsoDate(from) ? from : undefined, to: isValidIsoDate(to) ? to : undefined,
  });
  const typeLabel = (t: string | null) => (t && MARRIAGE_DEF.fields.find((f) => f.key === "marriage_type")?.options?.[t]) || t || "";
  const csv = toCsv(
    ["Record No.", "Groom", "Bride", "Date of Marriage", "Place of Marriage", "Marriage Type", "Minister", "Witnesses", "Banns Published", "Dispensation"],
    rows.map((r) => [r.recordNo, r.groom, r.bride, formatDate(r.date), r.place, typeLabel(r.type), r.minister, r.witnesses, r.banns, r.dispensation]),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(`matrimony_${todayIso()}.csv`)}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
