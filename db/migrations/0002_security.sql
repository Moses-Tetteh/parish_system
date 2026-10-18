-- 0002: security model, triggers and serverless support tables.
-- Run with the DIRECT (owner) connection, never with the app role.

-- ---------------------------------------------------------------------------
-- 1. updated_at maintained by the database (replaces MySQL's ON UPDATE CURRENT_TIMESTAMP).
--    Also what optimistic-concurrency checks in the app rely on.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Distributed rate limiter (Vercel runs many short-lived instances: memory is not shared).
-- ---------------------------------------------------------------------------
create table if not exists rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
create index if not exists idx_rate_limits_reset on rate_limits (reset_at);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security. Supabase exposes every table in `public` through its REST API using the
--    public anon key. RLS with NO policy for anon/authenticated = those keys can read nothing.
--    Only the dedicated application role gets a policy.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'parish_app') then
    create role parish_app login noinherit;  -- password is set separately: ALTER ROLE parish_app PASSWORD '...';
  end if;
end $$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_full_access on public.%I', t);
    execute format('create policy app_full_access on public.%I for all to parish_app using (true) with check (true)', t);
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all functions in schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    revoke all on all functions in schema public from authenticated;
    alter default privileges in schema public revoke all on tables from authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Least privilege for the application role.
-- ---------------------------------------------------------------------------
grant usage on schema public to parish_app;
grant select, insert, update, delete on all tables in schema public to parish_app;
grant usage, select on all sequences in schema public to parish_app;
alter default privileges in schema public grant select, insert, update, delete on tables to parish_app;
alter default privileges in schema public grant usage, select on sequences to parish_app;

-- Audit trail is append-only for the app: a compromised app/session cannot rewrite history.
revoke update, delete, truncate on audit_log from parish_app;
revoke update, delete, truncate on access_log from parish_app;
-- The migration ledger is not the app's business.
revoke all on schema_migrations from parish_app;
