/**
 * Email templates for BuildMy.Directory
 */

/** Escape HTML special characters to prevent XSS in email content */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a URL for safe use in href attributes (validates http(s) protocol via URL parser) */
function escUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "#";
    return url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  } catch {
    return "#";
  }
}

/** Sanitize a name for use in the email "From" header (remove angle brackets, newlines, control chars) */
export function sanitizeFromName(name: string): string {
  return name
    .replace(/[<>"'\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

export function verificationEmail(opts: {
  siteName: string;
  verifyUrl: string;
}) {
  return {
    subject: `Verify your subscription to ${esc(opts.siteName)}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Confirm your subscription</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          You subscribed to <strong>${esc(opts.siteName)}</strong>. Click the button below to verify your email and start receiving digest updates.
        </p>
        <a href="${escUrl(opts.verifyUrl)}" style="display: inline-block; background: #000; color: #fff; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
          Verify my email
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">
          If you didn't subscribe, you can ignore this email.
        </p>
      </div>
    `,
  };
}

export function digestEmail(opts: {
  siteName: string;
  siteUrl: string;
  posts: { title: string; url: string; category: string }[];
  unsubscribeUrl: string;
  preferencesUrl?: string;
}) {
  const postListHtml = opts.posts
    .map(
      (p) => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
            <a href="${escUrl(p.url)}" style="font-size: 15px; font-weight: 600; color: #000; text-decoration: none;">${esc(p.title)}</a>
            <br />
            <span style="font-size: 12px; color: #999;">${esc(p.category)}</span>
          </td>
        </tr>
      `,
    )
    .join("");

  return {
    subject: `New posts on ${esc(opts.siteName)}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">${esc(opts.siteName)}</h1>
        <p style="color: #666; font-size: 14px; margin-bottom: 24px;">Here's what's new:</p>
        <table style="width: 100%; border-collapse: collapse;">
          ${postListHtml}
        </table>
        <div style="margin-top: 24px;">
          <a href="${escUrl(opts.siteUrl)}" style="display: inline-block; background: #000; color: #fff; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
            Browse all posts
          </a>
        </div>
        <p style="color: #999; font-size: 11px; margin-top: 32px;">
          ${opts.preferencesUrl ? `<a href="${escUrl(opts.preferencesUrl)}" style="color: #999; margin-right: 12px;">Update preferences</a>` : ""}
          <a href="${escUrl(opts.unsubscribeUrl)}" style="color: #999;">Unsubscribe</a>
        </p>
      </div>
    `,
  };
}

export function contactInquiryEmail(opts: {
  fromName: string;
  fromEmail: string;
  topic: string;
  message: string;
}) {
  return {
    subject: `[${esc(opts.topic)}] Contact form: ${esc(opts.fromName)}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 20px; font-weight: 800; margin-bottom: 16px;">New contact form submission</h1>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 6px 0; color: #666; width: 90px;">Name</td><td style="padding: 6px 0;"><strong>${esc(opts.fromName)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;"><a href="mailto:${esc(opts.fromEmail)}" style="color: #000;">${esc(opts.fromEmail)}</a></td></tr>
          <tr><td style="padding: 6px 0; color: #666;">Topic</td><td style="padding: 6px 0;">${esc(opts.topic)}</td></tr>
        </table>
        <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${esc(opts.message)}</div>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">Reply directly to this email to respond to the sender.</p>
      </div>
    `,
  };
}

export function newSubscriberNotification(opts: {
  siteName: string;
  subscriberEmail: string;
  subscriberName: string | null;
  totalSubscribers: number;
  dashboardUrl: string;
}) {
  return {
    subject: `New subscriber on ${esc(opts.siteName)} — ${opts.totalSubscribers} total`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">🎉 New subscriber</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Someone new just confirmed their subscription to <strong>${esc(opts.siteName)}</strong>.
        </p>
        <div style="background: #f7f7f7; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px; font-size: 13px; color: #888;">Subscriber</p>
          <p style="margin: 0; font-size: 15px; font-weight: 600;">${esc(opts.subscriberName || opts.subscriberEmail)}</p>
          ${opts.subscriberName ? `<p style="margin: 4px 0 0; font-size: 13px; color: #888;">${esc(opts.subscriberEmail)}</p>` : ""}
        </div>
        <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
          You now have <strong>${opts.totalSubscribers}</strong> total subscriber${opts.totalSubscribers === 1 ? "" : "s"}.
        </p>
        <a href="${escUrl(opts.dashboardUrl)}" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
          View in dashboard
        </a>
      </div>
    `,
  };
}

export function pipelineCompleteNotification(opts: {
  siteName: string;
  siteUrl: string;
  postCount: number;
}) {
  return {
    subject: `Your directory "${esc(opts.siteName)}" is ready`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Your directory is live ✨</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          We finished scraping, transcribing, and categorizing your content.
          <strong>${opts.postCount}</strong> post${opts.postCount === 1 ? " is" : "s are"} now searchable
          at <strong>${esc(opts.siteName)}</strong>.
        </p>
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <a href="${escUrl(opts.siteUrl)}" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
            Visit your directory
          </a>
        </div>
        <p style="color: #999; font-size: 12px;">
          Share the link with your audience — and come back anytime to see analytics, manage subscribers, or answer content requests.
        </p>
      </div>
    `,
  };
}

export function welcomeEmail(opts: {
  siteName: string;
  siteUrl: string;
}) {
  return {
    subject: `Welcome to ${esc(opts.siteName)}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">You're in!</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Your email is verified. You'll now receive digest updates from <strong>${esc(opts.siteName)}</strong> with the latest content.
        </p>
        <a href="${escUrl(opts.siteUrl)}" style="display: inline-block; background: #000; color: #fff; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
          Browse the directory
        </a>
      </div>
    `,
  };
}
