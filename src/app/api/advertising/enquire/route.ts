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
 * Advertiser requests pricing on one or more ad slots for a specific
 * directory. Forwards the enquiry (with any uploaded creative files)
 * to the creator via Resend (with replyTo set to the advertiser) and
 * pings them on Telegram if a bot is configured. Pricing is never
 * exposed publicly — this endpoint's whole job is to gate the first
 * touch.
 *
 * Accepts either multipart/form-data (when files are attached) or
 * application/json (no files). Field shape:
 *
 *   siteSlug:         string
 *   slotTypes:        string[] (repeated form field) or single slotType
 *   advertiserEmail:  string
 *   advertiserName:   string (optional)
 *   businessName:     string (optional)
 *   website:          string (optional)
 *   socialHandle:     string (optional)
 *   message:          string
 *   files:            File[] (optional, multipart only)
 */

const MAX_TOTAL_FILE_BYTES = 35 * 1024 * 1024;
const MAX_FILES = 5;

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, emailLimiter);
  if (limited) return limited;

  try {
    let payload: Record<string, unknown>;
    let attachments: { filename: string; content: Buffer }[] = [];

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const all = (key: string) => form.getAll(key).map((v) => (typeof v === "string" ? v : ""));
      payload = {
        siteSlug: form.get("siteSlug"),
        slotTypes: form.getAll("slotTypes").filter((v): v is string => typeof v === "string"),
        advertiserEmail: form.get("advertiserEmail"),
        advertiserName: form.get("advertiserName"),
        businessName: form.get("businessName"),
        website: form.get("website"),
        socialHandle: form.get("socialHandle"),
        message: form.get("message"),
      };
      void all; // satisfy lint; not needed below

      const rawFiles = form.getAll("files").filter((v): v is File => v instanceof File);
      if (rawFiles.length > MAX_FILES) {
        return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 400 });
      }
      let total = 0;
      for (const f of rawFiles) {
        total += f.size;
        if (total > MAX_TOTAL_FILE_BYTES) {
          return NextResponse.json({ error: "Files exceed 35 MB combined limit" }, { status: 413 });
        }
        const buf = Buffer.from(await f.arrayBuffer());
        // Strip path separators, quotes, and control chars from the
        // filename before it ends up in a MIME header. Keep the
        // original extension where possible.
        const safeName = (f.name || "creative")
          .replace(/[\r\n\0<>:"/\\|?*]/g, "_")
          .slice(0, 200) || "creative";
        attachments.push({ filename: safeName, content: buf });
      }
    } else {
      payload = await request.json();
    }

    const siteSlug = str(payload.siteSlug);
    const slotType = str(payload.slotType);
    const rawTypes = Array.isArray(payload.slotTypes) ? (payload.slotTypes as unknown[]) : [];
    const typesRaw = rawTypes.map(str).concat(slotType ? [slotType] : []);
    const requestedTypes = Array.from(
      new Set(typesRaw.filter((t) => t.trim().length > 0)),
    );

    const advertiserEmail = str(payload.advertiserEmail);
    const advertiserName = str(payload.advertiserName);
    const businessName = str(payload.businessName);
    const website = str(payload.website);
    const socialHandle = str(payload.socialHandle);
    const message = str(payload.message);

    if (!siteSlug || requestedTypes.length === 0 || !advertiserEmail || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(advertiserEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (advertiserEmail.length > 320) return NextResponse.json({ error: "Email too long" }, { status: 400 });
    if (advertiserName.length > 128) return NextResponse.json({ error: "Name too long" }, { status: 400 });
    if (businessName.length > 200) return NextResponse.json({ error: "Business name too long" }, { status: 400 });
    if (website.length > 500) return NextResponse.json({ error: "Website too long" }, { status: 400 });
    if (socialHandle.length > 200) return NextResponse.json({ error: "Social handle too long" }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: "Message too long" }, { status: 400 });

    const matchedDefs = requestedTypes
      .map((id) => SLOT_TYPES.find((s) => s.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d);
    if (matchedDefs.length === 0) {
      return NextResponse.json({ error: "Unknown slot type" }, { status: 400 });
    }

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
    const fromName = advertiserName || advertiserEmail;

    const slotListHtml = matchedDefs
      .map((d) => `<li style="margin:0 0 4px"><strong>${esc(d.name)}</strong> — ${esc(d.tagline)}</li>`)
      .join("");

    const aboutRows: string[] = [];
    if (businessName) aboutRows.push(`<tr><td style="padding:4px 10px 4px 0;color:#56505e;font-size:12px;vertical-align:top">Business</td><td style="padding:4px 0;font-size:13px"><strong>${esc(businessName)}</strong></td></tr>`);
    if (website) aboutRows.push(`<tr><td style="padding:4px 10px 4px 0;color:#56505e;font-size:12px;vertical-align:top">Website</td><td style="padding:4px 0;font-size:13px">${esc(website)}</td></tr>`);
    if (socialHandle) aboutRows.push(`<tr><td style="padding:4px 10px 4px 0;color:#56505e;font-size:12px;vertical-align:top">Social</td><td style="padding:4px 0;font-size:13px">${esc(socialHandle)}</td></tr>`);
    const aboutBlock = aboutRows.length
      ? `<table style="border-collapse:collapse;margin:0 0 20px">${aboutRows.join("")}</table>`
      : "";

    const filesNote = attachments.length
      ? `<p style="color:#56505e;font-size:12px;margin:0 0 16px"><strong>${attachments.length} creative file${attachments.length === 1 ? "" : "s"} attached</strong> — see the attachments on this email.</p>`
      : "";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a0a2e">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#56505e;margin:0 0 8px">New advertising enquiry</p>
        <h1 style="font-size:22px;margin:0 0 4px">Quote request for ${esc(siteName)}</h1>
        <p style="color:#56505e;margin:0 0 20px">From <strong>${esc(fromName)}</strong> &lt;${esc(advertiserEmail)}&gt;</p>
        ${aboutBlock}
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#56505e;margin:0 0 6px">Formats requested (${matchedDefs.length})</p>
        <ul style="margin:0 0 20px;padding-left:18px;color:#1a0a2e;font-size:14px">${slotListHtml}</ul>
        ${filesNote}
        <div style="background:#f7f5f3;border:1px solid #e5e1da;border-radius:12px;padding:16px;white-space:pre-wrap">${esc(message)}</div>
        <p style="color:#56505e;font-size:13px;margin-top:20px">Reply to this email to respond to them directly.</p>
      </div>
    `;

    if (!resend) {
      console.warn("[enquire] Resend not configured — enquiry not delivered:", { siteSlug, requestedTypes, advertiserEmail });
      return NextResponse.json({ error: "Email service unavailable" }, { status: 503 });
    }

    const subjectFormats = matchedDefs.length === 1 ? matchedDefs[0].name : `${matchedDefs.length} formats`;
    const { error: sendError } = await resend.emails.send({
      from: "BuildMy.Directory <hello@buildmy.directory>",
      to: creator.email,
      replyTo: sanitizeHeader(advertiserEmail),
      subject: `Ad enquiry: ${subjectFormats} on ${siteName}`,
      html,
      attachments: attachments.length ? attachments : undefined,
    });
    if (sendError) {
      console.error("[enquire] Resend rejected:", sendError);
      return NextResponse.json({ error: "Failed to send" }, { status: 502 });
    }

    const tgFormats = matchedDefs.map((d) => `• ${d.name}`).join("\n");
    const tgAttach = attachments.length ? `\n${attachments.length} file${attachments.length === 1 ? "" : "s"} attached` : "";
    void sendTelegramMessage(
      `*Ad enquiry* on ${siteName}\nFrom: ${fromName} (${advertiserEmail})${tgAttach}\n\n${tgFormats}`,
    );

    return NextResponse.json({ message: "Enquiry sent" }, { status: 200 });
  } catch (err) {
    console.error("[enquire] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}
