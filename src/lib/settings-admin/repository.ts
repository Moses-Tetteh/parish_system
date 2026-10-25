import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAccess } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";

export class SettingsForbiddenError extends Error {}

/** Upserts settings in one transaction. Admin only; the change is access-logged (keys only — values such as an address are not copied into the log). */
export async function saveSettings(user: SessionUser, pairs: Record<string, string>): Promise<void> {
  if (!roleCan(user.role, "settings.manage")) throw new SettingsForbiddenError();
  await db().transaction(async (tx) => {
    for (const [k, v] of Object.entries(pairs)) {
      await tx.insert(schema.settings).values({ settingKey: k, settingValue: v.slice(0, 1000) })
        .onConflictDoUpdate({ target: schema.settings.settingKey, set: { settingValue: sql`excluded.setting_value` } });
    }
  });
  await logAccess({ username: user.username, role: user.role, action: "update", resource: "settings", detail: Object.keys(pairs).join(",") });
}

export async function allSettings(user: SessionUser): Promise<Record<string, string>> {
  if (!roleCan(user.role, "settings.manage")) throw new SettingsForbiddenError();
  const rows = await db().select().from(schema.settings);
  return Object.fromEntries(rows.map((r) => [r.settingKey, r.settingValue ?? ""]));
}

/** Read-only health check (uses pg_tables: information_schema hides tables the app role may not read, which would give false "missing" results): which tables the app expects (from the Drizzle schema) are actually present. Fixing = running `npm run db:migrate`. */
export async function systemCheck(user: SessionUser): Promise<{ tables: [string, boolean][]; missing: number; migrations: string[] }> {
  if (!roleCan(user.role, "settings.manage")) throw new SettingsForbiddenError();
  const { getTableName, is } = await import("drizzle-orm");
  const { PgTable } = await import("drizzle-orm/pg-core");
  const expected = Object.values(schema).filter((t) => is(t, PgTable)).map((t) => getTableName(t as never)).filter((n) => n !== "schema_migrations").sort(); // the ledger is deliberately off-limits to the app role
  const present = new Set((await db().execute(sql`select tablename as table_name from pg_tables where schemaname = 'public'`) as unknown as { table_name: string }[]).map((r) => r.table_name));
  const tables = expected.map((t) => [t, present.has(t)] as [string, boolean]);
  let migrations: string[] = [];
  try { migrations = (await db().execute(sql`select name from schema_migrations order by name`) as unknown as { name: string }[]).map((r) => r.name); } catch { /* table name differs or not created: informational only */ }
  return { tables, missing: tables.filter(([, ok]) => !ok).length, migrations };
}