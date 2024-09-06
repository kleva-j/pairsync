import { defineConfig } from "drizzle-kit";
import { env } from "env.mjs";

export default defineConfig({
  dbCredentials: { url: env.DATABASE_URL },
  schema: "./db/schema.ts",
  dialect: "postgresql",
  out: "./drizzle",
});
