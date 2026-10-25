"use server";

import { requirePermission } from "@/lib/auth/session";
import { back, intOf } from "@/lib/forms";
import { saveSnapshot } from "@/lib/reports/snapshots";

export async function snapshotAction(fd: FormData): Promise<void> {
  const user = await requirePermission("reports.snapshot");
  const year = intOf(fd, "year");
  if (!year || year < 2000 || year > 2100) back("/reports/annual", "error", "Invalid year.");
  try { await saveSnapshot(user, year!); } catch (e) { console.error("snapshot failed", e); back(`/reports/annual?year=${year}`, "error", "Could not save the snapshot."); }
  back(`/reports/annual?year=${year}`, "ok", `A frozen copy of the ${year} report has been saved. Later edits to the registers will not change it.`);
}
