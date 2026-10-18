/** CI / local test fixtures ONLY. Refuses to run against Supabase or without an explicit opt-in. */
import bcrypt from "bcryptjs";
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url || process.env.ALLOW_TEST_SEED !== "1" || /supabase\.(co|com)/.test(url)) {
    throw new Error("Refusing: set ALLOW_TEST_SEED=1 and point DIRECT_URL at a throw-away local database.");
  }
  const pw = process.env.TEST_PASSWORD ?? "";
  if (!pw) throw new Error("TEST_PASSWORD required");
  const hash = await bcrypt.hash(pw, 10);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  for (const [u, r] of [["sec_t", "secretary"], ["ppc_t", "ppc_secretary"], ["pri_t", "priest"]] as const) {
    await sql`insert into users (username, password_hash, role, full_name, is_active) values (${u}, ${hash}, ${r}, ${u}, 1)
      on conflict (username) do update set password_hash = excluded.password_hash, is_active = 1, failed_login_attempts = 0, locked_until = null`;
  }
  await sql.end();
  console.log("test users ready");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
