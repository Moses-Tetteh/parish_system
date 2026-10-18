/**
 * Creates (or resets) the first administrator. Uses the OWNER connection.
 *   DIRECT_URL=... ADMIN_USERNAME=admin ADMIN_PASSWORD='...' npm run seed:admin
 * No default password exists; weak ones are refused.
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "";
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL is required");
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("ADMIN_PASSWORD must be 10+ chars with upper, lower and a digit.");
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const hash = await bcrypt.hash(password, 12);
  await sql`
    insert into users (username, password_hash, role, full_name) values (${username}, ${hash}, 'admin', 'Administrator')
    on conflict (username) do update set password_hash = excluded.password_hash, is_active = 1, failed_login_attempts = 0, locked_until = null`;
  await sql.end();
  console.log(`Administrator "${username}" is ready.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
