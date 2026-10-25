# Parish Records — Next.js edition (Vercel + Supabase)

Production port of `parish_records_php` (Blessed Clementina Catholic Church, Ashaiman).
**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript strict · Tailwind 4 · Drizzle ORM · PostgreSQL (Supabase) · Vercel.

> Status: foundation, all 19 simple registers, auth/roles/audit and the production platform work are done and tested.
> Larger modules (financials, matrimony, certificates, announcements…) are listed in `MIGRATION.md`.
> **Deploy with `DEPLOYMENT.md`. Security design: `SECURITY.md`.**

## Local development
```bash
npm install
cp .env.example .env.local        # point DATABASE_URL at a local/dev Postgres, DATABASE_SSL=disable, COOKIE_SECURE=never
DIRECT_URL=postgresql://... npm run db:migrate
DIRECT_URL=postgresql://... ADMIN_PASSWORD='Long#Passw0rd!' npm run seed:admin
npm run dev
```
Tests: `npm test` (unit) · `npm run typecheck` · `npm run test:e2e` (HTTP end-to-end; CI runs all of them against Postgres, plus RLS checks).

## Architecture
* **DRY / register engine** — the 19 registers are *data* (`src/lib/registers/definitions.generated.ts`, exported from the PHP app by `tools/export-registers.php`). One engine provides list, search, filters, pagination, forms, validation, CSV export, archive/restore, duplicate warning and audit for all of them. A new register is one definition.
* **Security boundary** — `src/lib/auth/session.ts` (database-validated sessions) + `src/lib/auth/permissions.ts` (single role matrix) + repository-level checks.
* **Database as source of truth** — `db/migrations/*.sql` (schema, RLS/roles/triggers, search indexes), applied by `npm run db:migrate`; `src/db/schema.ts` is generated from it (`npm run db:pull`).
* **Serverless-safe** — stateless; Supabase transaction pooler (`prepare:false`, small pool); Postgres-backed rate limiter; no local files; capped exports; daily cron.
* **Responsive** — mobile-first, tables become cards on phones, 44 px touch targets, CSS-only menu, accessible forms.

## Layout
```
db/migrations/        SQL (source of truth)        scripts/   migrate, import-from-mysql, seed-admin, check-rls
src/lib/auth/         sessions, roles, passwords   src/lib/registers/   definitions, validation, repository
src/app/              pages, server actions, API   tests/     unit + end-to-end
.github/workflows/    CI, encrypted nightly backup tools/     PHP definition exporter (one-off)
```

## Modules
See `MIGRATION.md` for what is ported from the PHP app, what is intentionally not, and how to run the test suites.
