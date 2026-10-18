import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the pool or an open transaction. */
export type Executor = Db | Tx;

const g = globalThis as unknown as { __parishSql?: ReturnType<typeof postgres>; __parishDb?: Db };

/**
 * Serverless-safe connection: Supabase's *transaction pooler* (port 6543) multiplexes many short-lived
 * function instances onto few Postgres connections, so prepared statements are disabled and each
 * instance keeps a tiny pool.
 */
export function db(): Db {
  if (!g.__parishDb) {
    const e = env();
    g.__parishSql = postgres(e.DATABASE_URL, {
      max: e.NODE_ENV === "production" ? 3 : 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: e.DATABASE_SSL === "disable" ? false : "require",
      onnotice: () => {},
    });
    g.__parishDb = drizzle(g.__parishSql, { schema });
  }
  return g.__parishDb;
}

export { schema };
