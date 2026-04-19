import crypto from "crypto";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { hasFeature, type PlanId } from "@/lib/plans";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);

/**
 * Generate a new API key in the format `bmd_<40-char random>`.
 * The caller must store/display it immediately — we only keep the hash.
 */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(30).toString("base64url"); // ~40 chars
  const raw = `bmd_${random}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12); // "bmd_xxxxxxxx"
  return { raw, hash, prefix };
}

/** Compute the sha256 hash of a raw key for DB lookup. */
export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Read the Bearer token from the Authorization header, look it up, and
 * return the owning user plus their plan. Rejects if:
 *  - header missing or malformed
 *  - key not found
 *  - owning user's plan doesn't have `api_access`
 */
export async function authApiRequest(request: NextRequest): Promise<
  | { ok: true; userId: string; plan: PlanId; keyId: string }
  | { ok: false; status: number; error: string }
> {
  if (!db) return { ok: false, status: 503, error: "Database not configured" };

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization: Bearer header" };
  }

  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith("bmd_") || raw.length < 40) {
    return { ok: false, status: 401, error: "Invalid API key format" };
  }

  const hash = hashApiKey(raw);
  const keyRow = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, hash),
  });
  if (!keyRow) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, keyRow.userId),
    columns: { id: true, plan: true },
  });
  if (!user) {
    return { ok: false, status: 401, error: "Owner not found" };
  }

  const plan = (VALID_PLANS.has(user.plan) ? user.plan : "creator") as PlanId;
  if (!hasFeature(plan, "api_access")) {
    return {
      ok: false,
      status: 403,
      error: "API access is available on the Agency plan. Please upgrade.",
    };
  }

  // Update lastUsedAt (fire-and-forget; don't block the request)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRow.id))
    .catch((err) => console.error("[api-auth] lastUsedAt update failed:", err));

  return { ok: true, userId: user.id, plan, keyId: keyRow.id };
}
