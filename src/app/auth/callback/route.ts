import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * GET /auth/callback
 *
 * Handles the OAuth/email confirmation redirect from Supabase.
 * Exchanges the code for a session, ensures a users row exists,
 * and redirects to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Ensure a row exists in the application users table (idempotent)
      if (db) {
        try {
          await db.insert(users).values({
            id: data.user.id,
            email: data.user.email || `${data.user.id}@placeholder.local`,
            name: (data.user.user_metadata?.name as string) || null,
            plan: "free",
          }).onConflictDoNothing();
        } catch (err) {
          console.error("[auth/callback] Failed to create users row:", err);
          // Don't block login if sync fails — dashboard has a fallback
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
