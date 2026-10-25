# Port status (PHP → Next.js)

Legend: ✅ ported & tested · 🟡 ported, with a documented difference · ⬜ not ported (see "Not ported" below)

| Area | Status | Notes |
|---|---|---|
| Platform: Postgres schema, RLS, data import from XAMPP, Vercel config, CI, encrypted backups | ✅ | See `DEPLOYMENT.md` |
| Authentication, sessions, lockout, password change | ✅ | Default `admin123` removed; seed script instead |
| Role matrix incl. PPC Secretary | ✅ | PPC sees only Dashboard + Financials (members, dues, offering/dues ledger) |
| User management, audit trail, access log | ✅ | |
| Baptism, Communion, Confirmation, Death, Burial, Holy Orders, priests, catechists, counsellors, Mass times, feast days, property, outstations | ✅ | Generic engine |
| Holy Matrimony (spouses, marginal notes, certificates, import) | ✅ | |
| **Financials** — transactions, GL accounts, ledger, income & expenditure statement, budgets (suggest / vs actual), vouchers, PDF + CSV | ✅ | Role-scoped: PPC = dues/offering accounts only; Secretary = everything else |
| **Members & dues** — annual / age-tiered dues, oldest-year-first waterfall, arrears & advance, payment mirrored into the ledger | ✅ | |
| **Diocesan levy** (remittances) | ✅ | Totals follow the same category scope as Financials |
| **Announcements** — rich text (sanitised), review queue, Google Form sync, print + PDF | ✅ | Sync URL restricted to https Google hosts |
| **Households** — members, duplicate hint, dues-member link (finance roles only) | ✅ | |
| **Parishioners** — auto-sync from *all* registers (baptism, communion, confirmation, marriage, orders), cross-reference following, preview/apply, duplicates + merge, "not duplicates", irregular unions (confidential, logged), import from households | ✅ | Sync runs after every register save, never able to fail the save |
| **Marriage preparation** — checklist, dispensations, banns validation + auto-announcements, priest approval, cancel/re-open, convert to Matrimony | ✅ | |
| **Sacrament preparation & RCIA** — attendance, readiness, sponsor eligibility (+ priest override), promote into Baptism / Communion / Confirmation registers | ✅ | One transaction, all-or-nothing |
| **Societies** — members, dues by period, meetings | ✅ | Members are never deleted (history kept) |
| **Roster, liturgical calendar** (Easter-based, configurable Epiphany/Ascension/Corpus Christi) | ✅ | |
| **Baptism notifications** (Canon 535 §2) — pending by parish, letter, mark sent, incoming notices | ✅ | |
| **Annual statistical report** — live, CSV, PDF, frozen snapshots | ✅ | Finance section only for roles with levy access |
| **Settings** — identity, announcement-sync URL, workflow rules, system check | ✅ | Admin only |
| Certificates + PDF, marginal notations, Excel/CSV import | ✅ | |
| Dashboard, global search | 🟡 | Counts + search; no charts / upcoming-events panel |
| Sick & anointing | ✅ | Priest/admin only; summary header |
| Mass intentions, Burial register | ⬜ | Deliberately switched off in `DISABLED_REGISTERS` by the original port; the tables exist |

## Not ported (and why)
* **Backup / restore screens, and the PHP `system_check` repair tool** — the database is managed Postgres (Supabase). Use its backups and `npm run db:migrate`; the new *System Check* page only reports missing tables.
* **Emailed monthly reports / SMTP settings / scheduled "send now"** — needs a mail provider and a scheduler; storing SMTP passwords in the settings table was not carried over. The cron hook (`/api/cron/housekeeping`) is where it would attach.
* **Mass-intention weekly schedule / "celebrate" screens** — follow the register being switched off (see above).
* **Italic text in the announcements PDF** — only regular and bold faces are embedded; italic prints upright (screen/print preview keep it).

## Known differences
* Password policy is stricter (10+ chars, mixed). Existing passwords keep working until changed.
* Sessions are signed cookies re-validated per request instead of PHP server sessions.
* The database moves from MySQL to PostgreSQL. After `npm run db:import` the PHP app can no longer share it.
* Records use optimistic concurrency: two people editing one record get a conflict message instead of silently overwriting each other.
* Register hooks (`before_save`, `after_save`, panels, summary headers, row actions) are now implemented in `src/lib/registers/hooks.ts` and `src/components/RegisterHooks.tsx` / `src/components/panels/`.

## Tests
* `npm test` — 72 tests. Pure-logic tests always run; the `*.db.test.ts` suites run against a real Postgres when `TEST_DATABASE_URL` is set (they **truncate tables** — use a throw-away database).
* `python3 tests/smoke.py`, `tests/smoke_modules.py`, `tests/smoke_modules2.py` — HTTP end-to-end suites against a running app (throw-away database; see each file's header).
