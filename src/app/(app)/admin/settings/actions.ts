"use server";

import { requirePermission } from "@/lib/auth/session";
import { back, str } from "@/lib/forms";
import { assertGoogleCsvUrl } from "@/lib/announcements/sync";
import { WORKFLOW_FIELDS, parseWorkflow } from "@/lib/settings-admin/fields";
import { SettingsForbiddenError, saveSettings } from "@/lib/settings-admin/repository";
import { redirect } from "next/navigation";

async function persist(path: string, pairs: Record<string, string>, ok: string): Promise<never> {
  const user = await requirePermission("settings.manage");
  try { await saveSettings(user, pairs); }
  catch (e) { if (e instanceof SettingsForbiddenError) redirect("/forbidden"); console.error("settings save failed", e); back(path, "error", "Could not save the settings. Please try again."); }
  back(path, "ok", ok);
}

export async function saveIdentityAction(fd: FormData): Promise<void> {
  await persist("/admin/settings", { parish_name: str(fd, "parish_name", 150) || "Blessed Clementina Parish", parish_address: str(fd, "parish_address", 300), parish_slogan: str(fd, "parish_slogan", 400) }, "Parish identity updated.");
}

export async function saveAnnouncementsAction(fd: FormData): Promise<void> {
  const url = str(fd, "announcements_google_form_csv_url", 500);
  if (url) { try { assertGoogleCsvUrl(url); } catch (e) { back("/admin/settings", "error", e instanceof Error ? e.message : "Invalid URL."); } }
  await persist("/admin/settings", { announcements_google_form_csv_url: url }, "Announcements sync settings updated.");
}

export async function saveWorkflowAction(fd: FormData): Promise<void> {
  const r = parseWorkflow((k) => { const v = fd.get(k); return typeof v === "string" ? v : null; });
  if ("error" in r) back("/admin/settings/workflow", "error", r.error);
  else await persist("/admin/settings/workflow", r.values, "Workflow settings saved.");
}
