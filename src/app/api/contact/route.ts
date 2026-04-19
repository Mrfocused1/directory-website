import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/email/resend";
import { contactInquiryEmail, sanitizeHeader } from "@/lib/email/templates";
import { emailLimiter, checkRateLimit } from "@/lib/rate-limit-middleware";

const VALID_TOPICS = ["general", "sales", "support", "feedback", "press"];

/**
 * POST /api/contact
 *
 * Receives landing-page contact form submissions and forwards them as
 * an email to hello@buildmy.directory with the sender as reply-to.
 * Body: { name: string; email: string; topic: string; message: string }
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, emailLimiter);
  if (limited) return limited;
  try {
    const body = await request.json();
    const { name, email, topic, message } = body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Name, email and message are required" }, { status: 400 });
    }

    if (name.length > 128) return NextResponse.json({ error: "Name too long" }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: "Message too long (max 5000 characters)" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Please provide a valid email address" }, { status: 400 });
    }
    if (email.length > 320) return NextResponse.json({ error: "Email too long" }, { status: 400 });

    const resolvedTopic = VALID_TOPICS.includes(topic) ? topic : "general";

    if (!resend) {
      // Email service not configured — log the submission so we don't lose it
      console.warn("[contact] Resend not configured. Submission:", { name, email, resolvedTopic });
      return NextResponse.json({ error: "Email service temporarily unavailable" }, { status: 503 });
    }

    const template = contactInquiryEmail({
      fromName: name.trim(),
      fromEmail: email.trim(),
      topic: resolvedTopic,
      message: message.trim(),
    });

    try {
      const { error: sendError } = await resend.emails.send({
        from: "BuildMy.Directory <hello@buildmy.directory>",
        to: "hello@buildmy.directory",
        replyTo: sanitizeHeader(email.trim()),
        subject: template.subject,
        html: template.html,
      });
      if (sendError) {
        // Resend SDK returns { data, error } instead of throwing on API errors.
        // Common causes: unverified sender domain, invalid API key, rate limit.
        console.error("[contact] Resend rejected:", sendError);
        return NextResponse.json({ error: "Failed to send. Please try again." }, { status: 502 });
      }
    } catch (emailErr) {
      console.error("[contact] Failed to send email:", emailErr);
      return NextResponse.json({ error: "Failed to send. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ message: "Thanks! We'll get back to you soon." }, { status: 200 });
  } catch (err) {
    console.error("[contact] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
