# Port status (PHP → Next.js)

Legend: ✅ ported & tested · 🟡 ported, partly · ⬜ not yet ported (keep using the PHP app for this)

| Area | Status | Notes |
|---|---|---|
| Platform: Postgres schema, RLS, data import from XAMPP, Vercel config, CI, encrypted backups | ✅ | See `DEPLOYMENT.md` |
| Authentication, sessions, lockout, password change | ✅ | Default `admin123` removed; seed script instead |
| Role matrix incl. PPC Secretary | ✅ | Matrix ported; PPC financial screens are ⬜ |
| User management | ✅ | Last-admin and self-lockout guards |
| Audit trail / access log viewers | ✅ | |
| Baptism, Communion, Confirmation, Death (+delete rules), Burial, Holy Orders | ✅ | Generic engine |
| Parish priests, catechists, counsellors, Mass times, feast days, property, outstations | ✅ | |
| Sick & anointing (priest/admin only), Mass intentions, societies, marriage prep, candidates | 🟡 | Basic CRUD/export; custom hooks (banns, stipend totals, sponsor rules, roster) ⬜ |
| Parishioners | 🟡 | CRUD only; auto-sync from registers, households, merge/dedupe, new-parishioner rules ⬜ |
| Dashboard, global search | 🟡 | Counts + search; charts/upcoming-events ⬜ |
| Matrimony (spouses) | ⬜ | |
| Financials (transactions, dues waterfall, ledger, statement, budgets, diocesan levy) | ⬜ | Largest module (~2,100 lines PHP) |
| Announcements + Google Form sync | ⬜ | |
| Certificates / Vademecum cards / PDF reports | ⬜ | Plan: `pdf-lib` (already a dependency) |
| Excel/CSV import | ⬜ | |
| Backups, email reports, annual report snapshot, settings | ⬜ | |
| Marginal notations on baptism (Canon 535 §2) | ⬜ | |

## Known differences
* Password policy is stricter (10+ chars, mixed). Existing passwords keep working until changed.
* Sessions are signed cookies re-validated per request instead of PHP server sessions.
* The database moves from MySQL to PostgreSQL. After `npm run db:import` the PHP app can no longer share it: run the PHP app on XAMPP only until the missing modules above are ported, and treat Supabase as the source of truth once you go live (re-import is possible only before new data is entered).
* Records now use optimistic concurrency: two people editing one record get a conflict message instead of silently overwriting each other.
