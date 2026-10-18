/**
 * Applies db/migrations/*.sql in order, once each, using the OWNER connection (DIRECT_URL).
 *   DIRECT_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres npm run db:migrate
 * Each file runs in its own transaction and is recorded in schema_migrations.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL (owner connection, port 5432) to run migrations.");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
  const dir = path.join(process.cwd(), "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) { console.log(`skip  ${file}`); continue; }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path.join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`apply ${file}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
