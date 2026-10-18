# Going live: Supabase (database) + Vercel (app)

Do the steps in order. Budget about 60–90 minutes the first time.

## 0. Accounts and safety
* Create the Supabase, Vercel and GitHub accounts with **two-factor authentication ON** (an attacker who takes over any of these owns the parish data).
* Put the code in a **private** GitHub repository.

## 1. Supabase project
1. New project → pick the region nearest Ghana users (**West EU – London** `eu-west-2` is the closest of the free regions). If you choose another region, change `"regions"` in `vercel.json` to the matching Vercel region.
2. Use a long random **database password**; store it in a password manager.
3. *Project Settings → Data API*: **disable the Data API**. This app talks to Postgres directly, so there is no reason to expose a public REST endpoint. (Row-level security is also enabled on every table as a second lock — see `SECURITY.md`.)
4. Copy two connection strings from *Connect*:
   * **Session pooler** (port 5432) → this is your `DIRECT_URL` for migrations/imports. Prefer it over "Direct connection": direct is IPv6-only and many Ghanaian ISPs do not have IPv6.
   * **Transaction pooler** (port 6543) → the runtime `DATABASE_URL` (used in step 4).

## 2. Create the schema (from your computer)
```bash
npm install
export DIRECT_URL='postgresql://postgres.<ref>:<owner-password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
npm run db:migrate            # applies db/migrations/*.sql once each
./scripts/check-rls.sh        # must print: All public tables have RLS enabled.
```
Then give the application role its own password (it is created by migration `0002`):
```sql
-- Supabase → SQL editor
alter role parish_app password 'A-LONG-RANDOM-PASSWORD';
```
The app role can read/write registers but **cannot change or delete the audit/access logs**, and cannot touch the migration ledger.

## 3. Move your existing data (XAMPP → Supabase)
Keep XAMPP running. From the project folder:
```bash
export MYSQL_URL='mysql://root:@127.0.0.1:3306/parish_records'
export DIRECT_URL='<session pooler string from step 1>'
npm run db:import             # add "-- --truncate" to re-run from scratch
```
The script loads tables in foreign-key order, keeps every id, converts zero-dates to empty, advances the id counters, and **compares row counts per table**; it exits with an error if anything differs. Existing user passwords keep working. Spot-check a few records in the app before switching over.

If names look garbled (`Ã©`), the data was already double-encoded in XAMPP; tell me and I will add a repair step.

Create/reset an administrator with a strong password (no default exists):
```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='Long#Passw0rd!' npm run seed:admin
```
Then sign in and **change the passwords of all migrated users** (or disable the ones nobody uses).

## 4. Vercel
1. *Add New → Project* → import the GitHub repo (framework: Next.js is auto-detected).
2. *Settings → Environment Variables* (Production only):

| Name | Value |
|---|---|
| `DATABASE_URL` | Transaction pooler string, but with user **`parish_app.<project-ref>`** and the app-role password |
| `SESSION_SECRET` | 48+ random chars (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `COOKIE_SECURE` | `always` |
| `CRON_SECRET` | 16+ random chars (Vercel sends it to the cron route automatically) |
| `APP_NAME`, `TZ` | optional |

   **Never** put `DIRECT_URL` or the owner password in Vercel.
3. *Settings → Deployment Protection*: keep **Vercel Authentication** on for Preview deployments. Do **not** give Preview environments the production `DATABASE_URL` (use a second Supabase project for staging if you want previews).
4. Deploy. Then add your custom domain; HTTPS and HSTS are automatic.

## 5. Backups and keep-alive
* The daily Vercel Cron (`/api/cron/housekeeping`) touches the database, which prevents Supabase's free tier from pausing after a week of inactivity, and cleans the rate-limit table.
* Free Supabase has **no point-in-time recovery**. `.github/workflows/backup.yml` makes an **encrypted** nightly dump kept for 30 days as a private artifact:
  1. `age-keygen -o parish-backup.key` on a trusted computer. Keep the private key **offline** (two copies, e.g. priest's safe + parish office). The file prints a public key `age1…`.
  2. GitHub repo → *Settings → Secrets → Actions*: `BACKUP_AGE_PUBLIC_KEY` = that public key; `BACKUP_DATABASE_URL` = the **owner** session-pooler string. (`pg_dump` must bypass row-level security, which only the owner role does; the dump is encrypted before it is stored, and GitHub encrypts the secret. Use a private repo.)
  3. Run the workflow once manually, download the artifact, and **practice a restore**: `age -d -i parish-backup.key parish-….dump.age | pg_restore -d <empty db>`.
* A backup you have never restored is not a backup.

## 6. Go-live checklist
- [ ] `./scripts/check-rls.sh` passes against production
- [ ] Data API disabled in Supabase
- [ ] Sign in as each role and confirm the menu matches the role (secretary cannot see Users/Audit; PPC secretary sees no registers)
- [ ] Test users `sec_t`, `ppc_t`, `pri_t` do not exist in production (`select username from users;`)
- [ ] Old PHP admin/`admin123` account removed or re-passworded
- [ ] 2FA on GitHub, Vercel, Supabase
- [ ] First backup downloaded and restored successfully
- [ ] Run https://securityheaders.com on your domain (expect A)
- [ ] Parish has considered its obligations under Ghana's Data Protection Act, 2012 (Act 843): religious affiliation is *special personal data*; the Data Protection Commission registration and a short privacy notice are the parish's responsibility. (This is a checklist item, not legal advice.)

## Operations
* **Deploy**: merge to `main` → CI (types, tests, RLS check, build, end-to-end) → Vercel deploys.
* **Rollback**: Vercel → Deployments → *Instant Rollback*. Database migrations are forward-only; write a new migration to undo one.
* **New table?** Enable RLS in the same migration (`alter table x enable row level security;` + the `app_full_access` policy as in `0002`). CI fails otherwise.
* **Incident / suspected leak**: rotate `SESSION_SECRET` (signs everyone out), reset the `parish_app` password, review *Admin → Access log*.
* **Scaling**: stateless app (Vercel scales automatically); database load is bounded by pagination, indexes (including trigram search indexes) and the transaction pooler. First upgrade is Supabase compute; nothing in the code needs to change.
* **Free-tier limits to know**: Supabase free = 500 MB database, no PITR; Vercel Hobby is intended for non-commercial use (a parish is normally fine, but read the current terms) and has shorter function time limits (exports are capped at 20,000 rows for that reason).
