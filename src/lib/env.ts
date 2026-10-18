import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().refine((u) => u.startsWith("postgres"), "DATABASE_URL must be a PostgreSQL connection string (Supabase transaction pooler)"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DATABASE_SSL: z.enum(["require", "disable"]).default("require"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
  COOKIE_SECURE: z.enum(["auto", "always", "never"]).default("auto"),
  APP_NAME: z.string().default("Blessed Clementina Parish"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated lazily so `next build` works without secrets, but the app fails fast at first use. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
