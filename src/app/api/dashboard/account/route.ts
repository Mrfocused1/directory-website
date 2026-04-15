import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

/**
 * GET /api/dashboard/account — return the caller's profile + plan info.
 */
export async function GET() {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      id: true,
      email: true,
      name: true,
      plan: true,
      stripeCustomerId: true,
      createdAt: true,
    },
  });
  if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  return NextResponse.json({
    account: {
      id: row.id,
      email: row.email,
      name: row.name,
      plan: row.plan,
      hasBilling: !!row.stripeCustomerId,
      createdAt: row.createdAt.toISOString(),
    },
  });
}

/**
 * PATCH /api/dashboard/account — update name or email.
 * Email changes route through Supabase (triggers confirmation).
 */
export async function PATCH(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length > 64) return NextResponse.json({ error: "Name too long" }, { status: 400 });
    updates.name = name || null;
  }

  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    // Push the email change to Supabase Auth — it will email a confirmation link.
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.updateUser({ email });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // NOTE: we do NOT update the users table here — the webhook/session refresh
    // will carry the new email through once the user confirms.
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    await db.update(users).set(updates).where(eq(users.id, user.id));
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/dashboard/account — permanently delete the user.
 * Cancels Stripe subscription, deletes the Supabase auth user, and the
 * DB cascade removes sites/posts/subscribers.
 */
export async function DELETE() {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { stripeCustomerId: true },
  });

  // Deleting the Supabase auth user is REQUIRED. If we skip it and only
  // delete the DB row, the user could sign back in and /auth/callback
  // would silently recreate their app-side users row on the same UUID,
  // effectively resurrecting the "deleted" account.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    console.error("[account/delete] SUPABASE_SERVICE_ROLE_KEY missing — cannot delete auth user");
    return NextResponse.json(
      { error: "Account deletion is temporarily unavailable. Please contact support." },
      { status: 503 },
    );
  }

  try {
    const admin = createServiceRoleClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: adminErr } = await admin.auth.admin.deleteUser(user.id);
    if (adminErr) throw adminErr;
  } catch (err) {
    console.error("[account/delete] Supabase deleteUser failed:", err);
    return NextResponse.json(
      { error: "Failed to delete your authentication record. Please try again or contact support." },
      { status: 500 },
    );
  }

  // Cancel any active Stripe subscriptions (best-effort — auth is already
  // gone, so failures here can be cleaned up manually from Stripe and
  // won't resurrect the account).
  if (stripe && row?.stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: row.stripeCustomerId,
        status: "active",
        limit: 10,
      });
      for (const sub of subs.data) {
        await stripe.subscriptions.cancel(sub.id).catch((e) =>
          console.error("[account/delete] Stripe cancel failed for sub:", sub.id, e),
        );
      }
    } catch (err) {
      console.error("[account/delete] Stripe list subs failed:", err);
    }
  }

  // Delete the app-side users row (cascades to sites, posts, etc.)
  await db.delete(users).where(eq(users.id, user.id));

  return NextResponse.json({ deleted: true });
}
