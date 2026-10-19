import "server-only";
import { cache } from "react";
import { db, schema } from "@/db";

/** One query per request for the whole (tiny) `settings` table; keys follow the PHP app (parish_name, certificate_signoff_required…). */
const allSettings = cache(async (): Promise<Map<string, string>> => {
  const rows = await db().select({ k: schema.settings.settingKey, v: schema.settings.settingValue }).from(schema.settings);
  return new Map(rows.map((r) => [r.k, r.v ?? ""]));
});

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const v = (await allSettings()).get(key);
  return v === undefined || v === "" ? fallback : v;
}
