-- 0003: trigram (pg_trgm) indexes so case-insensitive substring search stays fast as registers grow.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_baptism_records_given_name_trgm on baptism_records using gin (given_name extensions.gin_trgm_ops);
create index if not exists idx_baptism_records_surname_trgm on baptism_records using gin (surname extensions.gin_trgm_ops);
create index if not exists idx_burial_records_full_name_trgm on burial_records using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_communion_records_full_name_trgm on communion_records using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_confirmation_records_full_name_trgm on confirmation_records using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_death_records_full_name_trgm on death_records using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_holy_orders_full_name_trgm on holy_orders using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_parishioners_full_name_trgm on parishioners using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_sacrament_candidates_full_name_trgm on sacrament_candidates using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_sick_calls_full_name_trgm on sick_calls using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_parish_priests_full_name_trgm on parish_priests using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_members_full_name_trgm on members using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_baptism_records_record_no_trgm on baptism_records using gin (record_no extensions.gin_trgm_ops);
create index if not exists idx_communion_records_record_no_trgm on communion_records using gin (record_no extensions.gin_trgm_ops);
create index if not exists idx_confirmation_records_record_no_trgm on confirmation_records using gin (record_no extensions.gin_trgm_ops);
create index if not exists idx_matrimony_records_record_no_trgm on matrimony_records using gin (record_no extensions.gin_trgm_ops);
