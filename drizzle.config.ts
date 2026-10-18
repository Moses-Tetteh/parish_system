import { defineConfig } from "drizzle-kit";

// Only used for `npm run db:pull` (regenerates src/db/schema.ts from the live database).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./.drizzle-pull",
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL! },
});
