import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";

/**
 * GET /api/auth/is-admin
 *
 * Lightweight check used by client components (e.g. DashboardNav) to
 * decide whether to show the "Admin" link. Always returns 200 so we
 * don't leak "admin route exists" on 401/403 responses.
 */
export async function GET() {
  const ok = await isAdmin();
  return NextResponse.json({ isAdmin: ok });
}
