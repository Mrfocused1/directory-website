import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { resend } from "@/lib/email/resend";
import { sanitizeFromName } from "@/lib/email/templates";
import crypto from "crypto";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Helpers ────────────────────────────────────────────────────────

/** Resolve the from address for subscriber-facing emails. */
export function resolveFromAddress(site: {
  senderDomainVerified: boolean | null;
  senderDomain: string | null;
  senderVerified: boolean | null;
  senderEmail: string | null;
  newsletterFromName?: string | null;
  displayName?: string | null;
  slug?: string;
}): string {
  const fromName = sanitizeFromName(site.newsletterFromName || site.displayName || site.slug || "Newsletter");

  if (site.senderDomainVerified && site.senderDomain) {
    return `${fromName} <hello@${site.senderDomain}>`;
  }
  if (site.senderVerified && site.senderEmail) {
    return `${fromName} <${site.senderEmail}>`;
  }
  return `${fromName} <hello@buildmy.directory>`;
}

// ─── GET /api/dashboard/sender ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  // Handle email verification confirmation via query param
  const action = request.nextUrl.searchParams.get("action");
  if (action === "confirm") {
    return handleConfirm(request);
  }

  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: {
      id: true,
      senderEmail: true,
      senderVerified: true,
      senderDomain: true,
      senderDomainVerified: true,
    },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  return NextResponse.json({
    senderEmail: site.senderEmail,
    senderVerified: site.senderVerified,
    senderDomain: site.senderDomain,
    senderDomainVerified: site.senderDomainVerified,
  });
}

// ─── POST /api/dashboard/sender ─────────────────────────────────────

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json();
  const { siteId, action } = body;

  if (!siteId || !action) {
    return NextResponse.json({ error: "Missing siteId or action" }, { status: 400 });
  }

  // Verify ownership
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  switch (action) {
    case "verify-email":
      return handleVerifyEmail(request, body, site);
    case "verify-domain":
      return handleVerifyDomain(body, site);
    case "remove":
      return handleRemove(site);
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

// ─── Action handlers ────────────────────────────────────────────────

async function handleVerifyEmail(
  request: NextRequest,
  body: { email?: string },
  site: { id: string; displayName: string | null; slug: string },
) {
  const email = body.email?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (email.length > 320) {
    return NextResponse.json({ error: "Email too long" }, { status: 400 });
  }

  // Generate verification token
  const token = crypto.randomBytes(48).toString("hex");
  const expiry = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

  await db!.update(sites).set({
    senderEmail: email,
    senderVerified: false,
    senderVerificationToken: token,
    senderVerificationExpiry: expiry,
    updatedAt: new Date(),
  }).where(eq(sites.id, site.id));

  // Send verification email from the platform address to the creator
  const origin = request.nextUrl.origin;
  const confirmUrl = `${origin}/api/dashboard/sender?action=confirm&token=${token}`;
  const siteName = site.displayName || site.slug;

  if (resend) {
    try {
      await resend.emails.send({
        from: "BuildMy.Directory <hello@buildmy.directory>",
        to: email,
        subject: `Verify your sender email for ${siteName}`,
        html: senderVerificationEmailHtml({ siteName, email, confirmUrl }),
      });
    } catch (err) {
      console.error("[sender] Failed to send verification email:", err);
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }
  }

  return NextResponse.json({
    message: "Verification email sent. Check your inbox.",
    senderEmail: email,
    senderVerified: false,
  });
}

async function handleConfirm(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const site = await db!.query.sites.findFirst({
    where: eq(sites.senderVerificationToken, token),
    columns: {
      id: true,
      senderEmail: true,
      senderVerificationExpiry: true,
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 404 });
  }

  if (site.senderVerificationExpiry && site.senderVerificationExpiry < new Date()) {
    return NextResponse.json({ error: "Verification link has expired. Please request a new one." }, { status: 410 });
  }

  await db!.update(sites).set({
    senderVerified: true,
    senderVerificationToken: null,
    senderVerificationExpiry: null,
    updatedAt: new Date(),
  }).where(eq(sites.id, site.id));

  // Redirect to the newsletter dashboard with a success indicator
  const origin = request.nextUrl.origin;
  return NextResponse.redirect(`${origin}/dashboard/newsletter?sender_verified=1`);
}

async function handleVerifyDomain(
  body: { domain?: string },
  site: { id: string },
) {
  const domain = body.domain?.toLowerCase().trim();
  if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }
  if (domain.length > 255) {
    return NextResponse.json({ error: "Domain too long" }, { status: 400 });
  }

  await db!.update(sites).set({
    senderDomain: domain,
    senderDomainVerified: false,
    updatedAt: new Date(),
  }).where(eq(sites.id, site.id));

  // Return the DNS records the creator needs to add.
  // In production these would come from the Resend Domains API;
  // for now we return the standard records.
  const dnsRecords = [
    {
      type: "TXT",
      name: domain,
      value: "v=spf1 include:send.resend.com ~all",
      purpose: "SPF — authorises Resend to send on behalf of your domain",
    },
    {
      type: "CNAME",
      name: `resend._domainkey.${domain}`,
      value: "resend._domainkey.resend.dev",
      purpose: "DKIM — cryptographic signature for email authenticity",
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none;",
      purpose: "DMARC — email authentication policy",
    },
  ];

  return NextResponse.json({
    message: "Domain saved. Add the DNS records below, then click Verify.",
    senderDomain: domain,
    senderDomainVerified: false,
    dnsRecords,
  });
}

async function handleRemove(site: { id: string }) {
  await db!.update(sites).set({
    senderEmail: null,
    senderVerified: false,
    senderVerificationToken: null,
    senderVerificationExpiry: null,
    senderDomain: null,
    senderDomainVerified: false,
    updatedAt: new Date(),
  }).where(eq(sites.id, site.id));

  return NextResponse.json({
    message: "Sender reset to default (hello@buildmy.directory)",
    senderEmail: null,
    senderVerified: false,
    senderDomain: null,
    senderDomainVerified: false,
  });
}

// ─── Email template ─────────────────────────────────────────────────

function senderVerificationEmailHtml(opts: {
  siteName: string;
  email: string;
  confirmUrl: string;
}): string {
  const { siteName, email, confirmUrl } = opts;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Verify your sender email</h2>
  <p style="font-size: 14px; color: #444; line-height: 1.6;">
    You requested to send emails for <strong>${siteName}</strong> from
    <strong>${email}</strong>.
  </p>
  <p style="font-size: 14px; color: #444; line-height: 1.6;">
    Click the button below to confirm this email address. The link expires in 24 hours.
  </p>
  <div style="margin: 28px 0;">
    <a href="${confirmUrl}"
       style="display: inline-block; background: #000; color: #fff; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none;">
      Verify Email Address
    </a>
  </div>
  <p style="font-size: 12px; color: #888; line-height: 1.5;">
    If you didn&apos;t request this, you can safely ignore this email.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa;">
    Sent by BuildMy.Directory
  </p>
</body>
</html>`.trim();
}
