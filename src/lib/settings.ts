import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export interface ParishSettings { slogan: string[]; address: string }

/**
 * The PHP login page and footer read `parish_slogan` / `parish_address` from the shared
 * `settings` table. Same here — and a DB hiccup must never take the sign-in page down.
 */
export async function getParishSettings(): Promise<ParishSettings> {
  try {
    const rows = await db().select().from(schema.settings).where(inArray(schema.settings.settingKey, ["parish_slogan", "parish_address"]));
    const get = (k: string) => (rows.find((r) => r.settingKey === k)?.settingValue ?? "").trim();
    return {
      slogan: get("parish_slogan").split("\n").map((s) => s.trim()).filter(Boolean),
      address: get("parish_address"),
    };
  } catch (e) {
    console.error("settings read failed", e);
    return { slogan: [], address: "" };
  }
}
