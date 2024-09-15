import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import postgres from "postgres";

import { env } from "env.mjs";

import * as schema from "./schema";

// for query purposes
const queryClient = postgres(env.DATABASE_URL);

export const db: PostgresJsDatabase<typeof schema> = drizzle(queryClient, {
  schema,
  logger: true,
});

export default db;
