/**
 * One-off, repeatable data import: legacy MySQL/MariaDB (XAMPP) -> Supabase Postgres.
 *
 *   MYSQL_URL=mysql://root:@127.0.0.1:3306/parish_records \
 *   DIRECT_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres \
 *   npm run db:import            # add -- --truncate to wipe the target tables first
 *
 * - Tables load in foreign-key order; ids are preserved so every reference stays valid.
 * - Zero-dates ("0000-00-00") become NULL; literal "NULL" strings in nullable date columns become NULL.
 * - Identity sequences are advanced past the imported ids.
 * - Row counts are compared at the end; any mismatch makes the script exit non-zero.
 * - mysql2 is a devDependency: it is never part of the Vercel deployment.
 */
import mysql from "mysql2/promise";
import postgres from "postgres";

const SKIP = new Set(["rate_limits", "schema_migrations"]);
const BATCH = 500;

async function main() {
  const myUrl = process.env.MYSQL_URL, pgUrl = process.env.DIRECT_URL;
  if (!myUrl || !pgUrl) throw new Error("Set MYSQL_URL and DIRECT_URL.");
  const truncate = process.argv.includes("--truncate");

  const my = await mysql.createConnection({ uri: myUrl, dateStrings: true, charset: "utf8mb4" });
  const pg = postgres(pgUrl, { max: 1, onnotice: () => {} });

  const pgTables = (await pg`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)
    .map((r) => r.table_name as string).filter((t) => !SKIP.has(t));
  const [myRows] = await my.query("select table_name as t from information_schema.tables where table_schema = database() and table_type='BASE TABLE'");
  const myTables = new Set((myRows as { t: string }[]).map((r) => r.t));

  // topological order by foreign keys
  const deps = await pg`select conrelid::regclass::text as child, confrelid::regclass::text as parent from pg_constraint where contype='f' and conrelid <> confrelid`;
  const order: string[] = [], seen = new Set<string>();
  const visit = (t: string) => {
    if (seen.has(t)) return; seen.add(t);
    for (const d of deps) if (d.child === t) visit(d.parent as string);
    if (pgTables.includes(t)) order.push(t);
  };
  pgTables.forEach(visit);

  if (truncate) {
    console.log("Truncating target tables…");
    await pg.unsafe(`truncate ${order.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
  }

  let mismatches = 0;
  for (const table of order) {
    if (!myTables.has(table)) { console.log(`skip   ${table} (not in MySQL)`); continue; }
    const cols = await pg`select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name=${table} order by ordinal_position`;
    const [myCols] = await my.query("select column_name as c from information_schema.columns where table_schema = database() and table_name = ?", [table]);
    const have = new Set((myCols as { c: string }[]).map((r) => r.c));
    const use = cols.filter((c) => have.has(c.column_name as string));
    const names = use.map((c) => c.column_name as string);
    const dateLike = new Set(use.filter((c) => /^(date|timestamp.*|time.*)$/.test(c.data_type as string)).map((c) => c.column_name as string));
    const textLike = new Set(use.filter((c) => c.data_type === "text" || c.data_type === "character varying").map((c) => c.column_name as string));

    const [cnt] = await my.query(`select count(*) as n from \`${table}\``);
    const n = Number((cnt as { n: number }[])[0]?.n ?? 0);
    let done = 0;
    await pg.begin(async (tx) => {
      for (let off = 0; off < n; off += BATCH) {
        const [rows] = await my.query(`select ${names.map((c) => `\`${c}\``).join(",")} from \`${table}\` order by 1 limit ${BATCH} offset ${off}`);
        const clean = (rows as Record<string, unknown>[]).map((r) => {
          const o: Record<string, unknown> = {};
          for (const c of names) {
            let v = r[c];
            if (typeof v === "string" && dateLike.has(c) && (/^0000-00-00/.test(v) || v === "NULL" || v === "")) v = null;
            if (v === undefined) v = null;
            if (typeof v === "string" && textLike.has(c)) v = v.replace(/\u0000/g, "");
            o[c] = v;
          }
          return o;
        });
        if (clean.length) await tx`insert into ${tx(table)} ${tx(clean, ...names)}`;
        done += clean.length;
      }
    }).catch((e) => { throw new Error(`Table "${table}" failed: ${e.message}`); });

    const idCol = names.includes("id");
    if (idCol) await pg.unsafe(`select setval(pg_get_serial_sequence('public.${table}', 'id'), greatest((select coalesce(max(id),0) from public.${table}), 1), (select count(*) > 0 from public.${table}))`);
    const cr = await pg.unsafe(`select count(*)::int as count from public.${table}`);
    const count = cr[0]?.count;
    const ok = Number(count) === Number(n);
    if (!ok) mismatches++;
    console.log(`${ok ? "ok  " : "FAIL"}   ${table.padEnd(28)} mysql=${n} postgres=${count}`);
  }
  await my.end(); await pg.end();
  if (mismatches) { console.error(`${mismatches} table(s) did not match.`); process.exit(1); }
  console.log("Import complete and verified.");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
