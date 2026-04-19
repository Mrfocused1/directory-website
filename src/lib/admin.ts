/**
 * Platform-owner admin gate.
 *
 * Membership is set by the ADMIN_EMAILS env var (comma-separated). Not a
 * DB column on purpose — it would add a migration + admin-management UX
 * for N=1 with no win, and a hijacked user row could grant itself the
 * flag. Env vars are restore-safe and can't be promoted from inside the
 * app.
 *
 * Failure mode: 404, not 403 — non-admins should not be able to confirm
 * /admin even exists. The standard `notFound()` from next/navigation
 * matches the noise of any unknown route.
 */

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getApiUser } from "@/lib/supabase/api";
import { redactEmail } from "@/lib/error";

function getAllowedEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Use this at the top of every server-rendered admin page AND at the top
 * of every /api/admin/* handler. Returns the authenticated user record
 * for convenience; throws Next's 404 when the caller isn't an admin.
 */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const allowed = getAllowedEmails();
  if (allowed.size === 0) {
    // No admins configured at all — refuse to expose the page rather
    // than open a wide-open hole. Misconfiguration shouldn't unlock
    // god mode by accident.
    notFound();
  }

  const user = await getApiUser();
  if (!user?.email || !allowed.has(user.email.toLowerCase())) {
    notFound();
  }

  // Cheap audit trail — log who hit which admin path. Cost is one
  // header lookup + one console line per admin request, fine in
  // production. Replace with structured logging later if needed.
  try {
    const h = await headers();
    const path = h.get("x-invoke-path") || h.get("referer") || "";
    console.log(`[admin] ${redactEmail(user.email)} → ${path}`);
  } catch {
    // headers() can throw outside RSC contexts — best-effort log only
  }

  return { id: user.id, email: user.email };
}

/** Boolean check for places where `notFound()` would interrupt unwanted flow. */
export async function isAdmin(): Promise<boolean> {
  const allowed = getAllowedEmails();
  if (allowed.size === 0) return false;
  const user = await getApiUser();
  return !!user?.email && allowed.has(user.email.toLowerCase());
}
