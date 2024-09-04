import { defineConfig } from "drizzle-kit";
import { env } from "env.mjs";

export default defineConfig({
  dbCredentials: { url: env.DATABASE_URL },
  dialect: "postgresql",
  schema: "./db/schema.ts",
});
