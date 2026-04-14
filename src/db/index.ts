import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import * as relations from "./relations";

function createDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL is not set — database features will be unavailable");
    return null;
  }
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });
  return drizzle(client, { schema: { ...schema, ...relations } });
}

export const db = createDb();
export type DB = NonNullable<typeof db>;
