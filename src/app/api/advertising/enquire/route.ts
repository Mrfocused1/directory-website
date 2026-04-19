import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resend } from "@/lib/email/resend";
import { sanitizeHeader, esc } from "@/lib/email/templates";
import { emailLimiter, checkRateLimit } from "@/lib/rate-limit-middleware";
import { sendTelegramMessage } from "@/lib/notifications/telegram";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";

/**
 * POST /api/advertising/enquire
 *
 * Advertiser requests pricing on a specific ad slot for a specific
 * directory. Forwards the enquiry to the creator via Resend (with
 * replyTo set to the advertiser) and pings the creator on Telegram
 * if a bot is configured. Pricing is never exposed publicly — this
 * endpoint's whole job is to gate the first touch.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, emailLimiter);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { siteSlug, slotType, advertiserEmail, advertiserName, message } = body ?? {};

    if (!siteSlug?.trim() || !slotType?.trim() || !advertiserEmail?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(advertiserEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (advertiserEmail.length > 320) return NextResponse.json({ error: "Email too long" }, { status: 400 });
    if ((advertiserName || "").length > 128) return NextResponse.json({ error: "Name too long" }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: "Message too long" }, { status: 400 });

    const slotDef = SLOT_TYPES.find((s) => s.id === slotType);
    if (!slotDef) return NextResponse.json({ error: "Unknown slot type" }, { status: 400 });

    if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

    const [site] = await db
      .select({
        id: sites.id,
        displayName: sites.displayName,
        slug: sites.slug,
        userId: sites.userId,
      })
      .from(sites)
      .where(and(eq(sites.slug, siteSlug), eq(sites.isPublished, true)))
      .limit(1);
    if (!site) return NextResponse.json({ error: "Directory not found" }, { status: 404 });

    const [creator] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, site.userId))
      .limit(1);
    if (!creator?.email) return NextResponse.json({ error: "Creator unreachable" }, { status: 503 });

    const siteName = site.displayName || site.slug;
    const fromName = (advertiserName || "").trim() || advertiserEmail.trim();

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a0a2e">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#56505e;margin:0 0 8px">New advertising enquiry</p>
        <h1 style="font-size:22px;margin:0 0 4px">${esc(slotDef.name)} on ${esc(siteName)}</h1>
        <p style="color:#56505e;margin:0 0 20px">From <strong>${esc(fromName)}</strong> &lt;${esc(advertiserEmail)}&gt;</p>
        <div style="background:#f7f5f3;border:1px solid #e5e1da;border-radius:12px;padding:16px;white-space:pre-wrap">${esc(message.trim())}</div>
        <p style="color:#56505e;font-size:13px;margin-top:20px">Reply to this email to respond to them directly.</p>
      </div>
    `;

    if (!resend) {
      console.warn("[enquire] Resend not configured — enquiry not delivered:", {
        siteSlug, slotType, advertiserEmail,
      });
      return NextResponse.json({ error: "Email service unavailable" }, { status: 503 });
    }

    const { error: sendError } = await resend.emails.send({
      from: "BuildMy.Directory <hello@buildmy.directory>",
      to: creator.email,
      replyTo: sanitizeHeader(advertiserEmail.trim()),
      subject: `Ad enquiry: ${slotDef.name} on ${siteName}`,
      html,
    });
    if (sendError) {
      console.error("[enquire] Resend rejected:", sendError);
      return NextResponse.json({ error: "Failed to send" }, { status: 502 });
    }

    // Telegram ping — silent no-op if creds not set. Not awaited.
    void sendTelegramMessage(
      `*Ad enquiry*\n${slotDef.name} on ${siteName}\nFrom: ${fromName} (${advertiserEmail})`,
    );

    return NextResponse.json({ message: "Enquiry sent" }, { status: 200 });
  } catch (err) {
    console.error("[enquire] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
