/**
 * Spam Detection — runs every 2 hours, checks recent signups for abuse patterns.
 */

import { db } from "@/db";
import { users, sites } from "@/db/schema";
import { gte } from "drizzle-orm";

const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "guerrillamail.com", "mailinator.com", "throwaway.email",
  "yopmail.com", "trashmail.com", "fakeinbox.com", "dispostable.com",
  "maildrop.cc", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.net", "guerrillamail.org", "spam4.me", "getairmail.com",
  "mailnull.com", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "spamspot.com", "spamthisplease.com", "tempinbox.com", "spamfree24.org",
  "spammotel.com", "filzmail.com", "throwam.com", "tempr.email",
]);

const SPAM_WORDS = [
  "casino", "crypto pump", "forex signals", "bitcoin giveaway",
  "free money", "make money fast", "earn from home guaranteed",
  "investment returns", "mlm", "ponzi",
];

type FlaggedUser = { email: string; reason: string };

export async function runSpamDetection() {
  console.log("[spam-detection] starting");
  if (!db) return { skipped: "db not configured" };

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentUsers = await db.query.users.findMany({
    where: gte(users.createdAt, cutoff),
    columns: { id: true, email: true, createdAt: true },
  });

  const flagged: FlaggedUser[] = [];

  // Check disposable domains
  for (const user of recentUsers) {
    const domain = user.email.split("@")[1]?.toLowerCase() || "";
    if (DISPOSABLE_DOMAINS.has(domain)) {
      flagged.push({ email: user.email, reason: `disposable email domain: ${domain}` });
    }
  }

  // Check for multiple accounts from same email prefix
  const prefixCount = new Map<string, string[]>();
  for (const user of recentUsers) {
    const [localPart] = user.email.split("@");
    // Strip trailing digits to detect test1@, test2@, test3@
    const prefix = localPart.replace(/\d+$/, "").toLowerCase();
    if (prefix.length < 3) continue;
    const bucket = prefixCount.get(prefix) || [];
    bucket.push(user.email);
    prefixCount.set(prefix, bucket);
  }
  for (const [prefix, emails] of prefixCount) {
    if (emails.length >= 3) {
      for (const email of emails) {
        if (!flagged.some((f) => f.email === email)) {
          flagged.push({ email, reason: `multiple accounts with prefix "${prefix}" (${emails.length} accounts)` });
        }
      }
    }
  }

  // Check site displayNames for spam words
  const allSites = await db.query.sites.findMany({
    columns: { userId: true, displayName: true, slug: true },
  });
  const userIdToEmail = new Map(recentUsers.map((u) => [u.id, u.email]));

  for (const site of allSites) {
    const email = userIdToEmail.get(site.userId);
    if (!email) continue;
    const name = (site.displayName || "").toLowerCase();
    const hitWord = SPAM_WORDS.find((w) => name.includes(w));
    if (hitWord) {
      if (!flagged.some((f) => f.email === email)) {
        flagged.push({ email, reason: `site "${site.slug}" displayName contains spam word: "${hitWord}"` });
      }
    }
  }

  console.log(`[spam-detection] done — usersChecked=${recentUsers.length} flagged=${flagged.length}`);
  if (flagged.length > 0) {
    console.log("[spam-detection] flagged users:", JSON.stringify(flagged, null, 2));
  }

  return { usersChecked: recentUsers.length, flagged };
}
