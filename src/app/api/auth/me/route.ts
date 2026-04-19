import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * POST /api/auth/me
 *
 * Ensures the authenticated user has a row in the app-side users table.
 * Called after email confirmation to sync Supabase auth with our DB.
 */
export async function POST() {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (db) {
    try {
      await db.insert(users).values({
        id: user.id,
        email: user.email || `${user.id}@placeholder.local`,
        plan: "creator",
      }).onConflictDoNothing();
    } catch (err) {
      console.error("[auth/me] Failed to ensure users row:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
