import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * POST /api/admin/users/revoke
 * Body: { email: string }
 *
 * Admin-only. Permanently deletes a user account + all their sites
 * (cascade deletes posts, references, pipeline_jobs, subscribers,
 * visitor_profiles, collections, bookmarks, analytics) AND removes
 * the Supabase auth user so the email is free to sign up again and
 * create a brand-new directory from scratch.
 *
 * Irreversible. The user's content is gone.
 */
export async function POST(request: NextRequest) {
  await requireAdmin();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Find the app-side user
  const appUser = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, email: true },
  });

  // Find the Supabase auth user
  const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const authUser = authList?.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );

  if (!appUser && !authUser) {
    return NextResponse.json({ error: `No user found with email ${email}` }, { status: 404 });
  }

  const deleted: string[] = [];

  // 1. Delete app-side user row (cascades to sites → posts → refs → jobs → subscribers → etc.)
  if (appUser) {
    const userSites = await db
      .select({ id: sites.id, slug: sites.slug })
      .from(sites)
      .where(eq(sites.userId, appUser.id));

    await db.delete(users).where(eq(users.id, appUser.id));
    deleted.push(
      `app user ${appUser.id.slice(0, 8)}`,
      `${userSites.length} site(s): ${userSites.map((s) => "/" + s.slug).join(", ") || "none"}`,
    );
  }

  // 2. Delete Supabase auth user (frees the email for re-registration)
  if (authUser) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    if (error) {
      deleted.push(`supabase auth delete FAILED: ${error.message}`);
    } else {
      deleted.push(`supabase auth user ${authUser.id.slice(0, 8)}`);
    }
  }

  console.log(`[admin/revoke] ${email}: ${deleted.join(" | ")}`);

  return NextResponse.json({
    revoked: true,
    email,
    details: deleted,
    message: `${email} is now free to sign up again and create a new directory.`,
  });
}
