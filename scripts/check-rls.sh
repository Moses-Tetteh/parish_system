#!/usr/bin/env bash
# Run after EVERY migration against production: lists tables that would be exposed through Supabase's public API.
set -euo pipefail
bad=$(psql "${DIRECT_URL:?set DIRECT_URL}" -Atc "select tablename from pg_tables where schemaname='public' and not rowsecurity")
if [ -n "$bad" ]; then echo "UNPROTECTED TABLES: $bad"; exit 1; fi
echo "All public tables have RLS enabled."
