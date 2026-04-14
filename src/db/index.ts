import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import * as relations from "./relations";

function createDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL is not set — database features will be unavailable");
    return null;
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema: { ...schema, ...relations } });
}

export const db = createDb();
export type DB = NonNullable<typeof db>;
