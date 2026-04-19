/**
 * Email templates for BuildMy.Directory
 *
 * Brand colors (from globals.css):
 *   --bd-dark:   #1a0a2e  (dark purple)
 *   --bd-cream:  #f5f0eb
 *   --bd-lime:   #d3fd74  (accent green)
 *   --bd-lilac:  #b0b0fe
 *   --bd-grey:   #56505e
 */

const BD_DARK = "#1a0a2e";
const BD_LIME = "#d3fd74";
const BD_GREY = "#56505e";
const LOGO_URL = "https://buildmy.directory/logo-white.svg";
const FONT_STACK = "Arial, Helvetica, sans-serif";

/** Escape HTML special characters to prevent XSS in email content */
export function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip characters that would allow header injection via subject / reply-to */
export function sanitizeHeader(str: string): string {
  return str.replace(/[\r\n]/g, " ").trim().slice(0, 200);
}

/** Escape a URL for safe use in href attributes (validates http(s) protocol via URL parser) */
export function escUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "#";
    return url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  } catch {
    return "#";
  }
}

/**
 * Branded email wrapper — wraps arbitrary HTML content in the
 * BuildMy.Directory header/footer chrome.  All styles are inline for
 * maximum email-client compatibility.
 */
export function brandedEmail(content: string, subject: string): { subject: string; html: string } {
  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(subject)}</title></head>
<body style="margin: 0; padding: 0; background-color: #f0eded; font-family: ${FONT_STACK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0eded;">
    <tr><td align="center" style="padding: 24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; border-radius: 8px; overflow: hidden;">
        <!-- HEADER -->
        <tr>
          <td style="background-color: ${BD_DARK}; padding: 28px 32px; text-align: center;">
            <img src="${LOGO_URL}" alt="BuildMy.Directory" width="180" style="display: inline-block; height: auto; max-width: 180px;" />
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="background-color: #ffffff; padding: 36px 32px; font-family: ${FONT_STACK}; font-size: 15px; line-height: 1.6; color: #333333;">
            ${content}
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="background-color: ${BD_DARK}; padding: 24px 32px; text-align: center; font-family: ${FONT_STACK};">
            <p style="margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #ffffff;">BuildMy.Directory</p>
            <p style="margin: 0 0 12px; font-size: 12px; color: ${BD_GREY};">
              <a href="mailto:hello@buildmy.directory" style="color: ${BD_GREY}; text-decoration: underline;">hello@buildmy.directory</a>
            </p>
            <p style="margin: 0; font-size: 11px; color: ${BD_GREY};">
              <a href="{{unsubscribe_url}}" style="color: ${BD_GREY}; text-decoration: underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

/**
 * Platform welcome email — sent when a new user signs up for
 * BuildMy.Directory (not per-directory subscriber welcome).
 */
export function platformWelcomeEmail(userName?: string): { subject: string; html: string } {
  const greeting = userName
    ? `<h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px; color: ${BD_DARK};">Hey ${esc(userName)}, welcome aboard!</h1>`
    : `<h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px; color: ${BD_DARK};">Welcome aboard!</h1>`;

  const content = `
${greeting}
<p style="margin: 0 0 20px;">
  You now have everything you need to turn your content into a beautiful,
  searchable directory. Here's what you can do right away:
</p>
<ul style="padding-left: 20px; margin: 0 0 28px;">
  <li style="margin-bottom: 6px;">Enter your handle and we'll pull in your content</li>
  <li style="margin-bottom: 6px;">Customize your directory's look and categories</li>
  <li>Share it with your audience</li>
</ul>
<div style="text-align: center; margin: 0 0 28px;">
  <a href="https://buildmy.directory/onboarding" style="display: inline-block; background-color: ${BD_LIME}; color: ${BD_DARK}; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 700; text-decoration: none;">
    Build your directory
  </a>
</div>
<p style="font-size: 14px; font-weight: 700; margin: 0 0 12px; color: ${BD_DARK};">Here's what happens next:</p>
<ol style="padding-left: 20px; margin: 0; font-size: 14px; color: #555555;">
  <li style="margin-bottom: 6px;">We scrape, transcribe, and categorize your content automatically</li>
  <li style="margin-bottom: 6px;">You'll get an email the moment your directory is live</li>
  <li>Visitors can subscribe, search, and browse — all for free</li>
</ol>`;

  return brandedEmail(content, "Welcome to BuildMy.Directory");
}

/**
 * Directory-live notification — sent when a user's directory finishes
 * building and is publicly accessible.
 */
export function directoryLiveEmail(displayName: string, slug: string, postCount: number): { subject: string; html: string } {
  const dirUrl = `https://buildmy.directory/${encodeURIComponent(slug)}`;

  const content = `
<h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px; color: ${BD_DARK};">Congrats, ${esc(displayName)}!</h1>
<p style="margin: 0 0 20px;">
  Your directory is live and ready to share with the world.
</p>
<div style="background-color: #f7f5f3; border-radius: 8px; padding: 20px 24px; margin: 0 0 24px;">
  <p style="margin: 0 0 8px; font-size: 13px; color: ${BD_GREY};">Your directory URL</p>
  <p style="margin: 0 0 14px; font-size: 16px; font-weight: 700;">
    <a href="${escUrl(dirUrl)}" style="color: ${BD_DARK}; text-decoration: underline;">buildmy.directory/${esc(slug)}</a>
  </p>
  <p style="margin: 0; font-size: 13px; color: ${BD_GREY};">
    <strong style="font-size: 20px; color: ${BD_DARK};">${postCount}</strong> post${postCount === 1 ? "" : "s"} indexed and searchable
  </p>
</div>
<div style="text-align: center; margin: 0 0 16px;">
  <a href="${escUrl(dirUrl)}" style="display: inline-block; background-color: ${BD_LIME}; color: ${BD_DARK}; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 700; text-decoration: none;">
    View your directory
  </a>
</div>
<div style="text-align: center; margin: 0 0 8px;">
  <a href="https://buildmy.directory/dashboard" style="color: ${BD_DARK}; font-size: 14px; font-weight: 600; text-decoration: underline;">
    Go to dashboard
  </a>
</div>`;

  return brandedEmail(content, "Your directory is live!");
}

/** Sanitize a name for use in the email "From" header (remove angle brackets, newlines, control chars) */
export function sanitizeFromName(name: string): string {
  return name
    .replace(/[<>"'\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

/**
 * Confirm-your-account email sent on signup. Delivered via Resend from
 * hello@buildmy.directory (not Supabase's default sender). The URL inside
 * is Supabase's own confirmation link generated via admin.generateLink,
 * so clicking it still hands back a signed session just like the native
 * flow would.
 */
export function signupConfirmEmail(opts: { code: string }) {
  return brandedEmail(
    `<h1 style="font-size: 24px; font-weight: 800; color: ${BD_DARK}; margin: 0 0 8px;">Welcome to BuildMy.Directory</h1>
    <p style="color: ${BD_GREY}; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      Finish creating your account by entering the code below.
    </p>
    <div style="text-align: center; margin: 0 0 24px;">
      <div style="display: inline-block; background: #f6f6f2; border: 2px solid ${BD_DARK}; border-radius: 14px; padding: 18px 32px;">
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 34px; font-weight: 800; color: ${BD_DARK}; letter-spacing: 8px; line-height: 1;">
          ${esc(opts.code)}
        </div>
        <div style="color: ${BD_GREY}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin-top: 8px;">
          Your 6-digit code
        </div>
      </div>
    </div>
    <p style="color: ${BD_GREY}; font-size: 13px; text-align: center; margin: 0 0 28px;">
      Enter this on the signup page. Expires in 1 hour.
    </p>
    <p style="color: #999; font-size: 12px; margin: 0;">
      If you didn't create an account, you can safely ignore this email.
    </p>`,
    "Confirm your BuildMy.Directory account",
  );
}

/**
 * Password-reset email, also delivered via Resend from
 * hello@buildmy.directory. URL is Supabase's recovery link from
 * admin.generateLink({ type: 'recovery' }).
 */
export function passwordResetEmail(opts: { resetUrl: string }) {
  return brandedEmail(
    `<h1 style="font-size: 24px; font-weight: 800; color: ${BD_DARK}; margin: 0 0 8px;">Reset your password</h1>
    <p style="color: ${BD_GREY}; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
      Click below to choose a new password. The link is valid for 1 hour.
    </p>
    <div style="text-align: center; margin: 0 0 28px;">
      <a href="${escUrl(opts.resetUrl)}" style="display: inline-block; background: ${BD_LIME}; color: ${BD_DARK}; padding: 14px 36px; border-radius: 50px; font-size: 14px; font-weight: 700; text-decoration: none;">
        Reset my password
      </a>
    </div>
    <p style="color: #999; font-size: 12px; margin: 0;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>`,
    "Reset your BuildMy.Directory password",
  );
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
            <a href="${escUrl(p.url)}" style="font-size: 15px; font-weight: 600; color: ${BD_DARK}; text-decoration: none;">${esc(p.title)}</a>
            <br />
            <span style="font-size: 12px; color: ${BD_GREY};">${esc(p.category)}</span>
          </td>
        </tr>
      `,
    )
    .join("");

  const content = `
<h1 style="font-size: 24px; font-weight: 800; margin: 0 0 4px; color: ${BD_DARK};">${esc(opts.siteName)}</h1>
<p style="color: #666; font-size: 14px; margin: 0 0 24px;">Here's what's new:</p>
<table style="width: 100%; border-collapse: collapse;">
  ${postListHtml}
</table>
<div style="text-align: center; margin: 24px 0 0;">
  <a href="${escUrl(opts.siteUrl)}" style="display: inline-block; background-color: ${BD_LIME}; color: ${BD_DARK}; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
    Browse all posts
  </a>
</div>
<p style="color: ${BD_GREY}; font-size: 11px; margin-top: 32px;">
  ${opts.preferencesUrl ? `<a href="${escUrl(opts.preferencesUrl)}" style="color: ${BD_GREY}; margin-right: 12px;">Update preferences</a>` : ""}
  <a href="${escUrl(opts.unsubscribeUrl)}" style="color: ${BD_GREY};">Unsubscribe</a>
</p>`;

  const subject = `New posts on ${esc(opts.siteName)}`;
  return brandedEmail(content, subject);
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
          Share the link with your audience — and come back anytime to see analytics and manage subscribers.
        </p>
      </div>
    `,
  };
}

export function invoiceEmail(opts: { invoicePdfUrl: string }) {
  return {
    subject: "Your BuildMy.Directory invoice",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Your invoice is ready</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Thanks for subscribing to BuildMy.Directory! Your invoice is available to download below.
        </p>
        <a href="${escUrl(opts.invoicePdfUrl)}" style="display: inline-block; background: #000; color: #fff; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
          Download invoice PDF
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">
          If you have any billing questions, just reply to this email.
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

/**
 * Site Doctor report email — sent to platform admins after each
 * automated doctor run. Shows auto-fixed issues and items needing
 * manual attention.
 */
export function doctorReportEmail(report: {
  startedAt: string;
  completedAt: string | null;
  sitesInspected: number;
  issues: { type: string; siteSlug?: string; shortcode?: string; detail: string }[];
  fixes: { type: string; success: boolean; detail: string }[];
  flagged: { type: string; siteSlug?: string; detail: string }[];
}): { subject: string; html: string } {
  const successFixes = report.fixes.filter((f) => f.success);
  const failedFixes = report.fixes.filter((f) => !f.success);
  const hasActivity = report.issues.length > 0 || report.fixes.length > 0 || report.flagged.length > 0;

  const fixRows = successFixes
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8f5e9;">
          <span style="color:#16a34a;font-weight:700;">&#10003;</span>
          &nbsp;${esc(f.detail)}
        </td>
      </tr>`,
    )
    .join("");

  const failedRows = failedFixes
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #fff3cd;">
          <span style="color:#d97706;font-weight:700;">&#9888;</span>
          &nbsp;${esc(f.detail)}
        </td>
      </tr>`,
    )
    .join("");

  const flaggedRows = report.flagged
    .map(
      (fl) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #fde8e8;">
          <strong style="color:#dc2626;">${esc(fl.type)}</strong>
          ${fl.siteSlug ? ` <span style="color:${BD_GREY};">(${esc(fl.siteSlug)})</span>` : ""}
          &nbsp;— ${esc(fl.detail)}
        </td>
      </tr>`,
    )
    .join("");

  const content = `
<h1 style="font-size:22px;font-weight:800;margin:0 0 4px;color:${BD_DARK};">Site Doctor Report</h1>
<p style="margin:0 0 20px;color:${BD_GREY};font-size:13px;">${esc(report.startedAt)}${report.completedAt ? ` → ${esc(report.completedAt)}` : ""}</p>

<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;background:#f7f5f3;border-radius:8px;">
  <tr>
    <td style="padding:14px 18px;font-weight:700;color:${BD_DARK};">Sites inspected</td>
    <td style="padding:14px 18px;font-size:20px;font-weight:800;color:${BD_DARK};">${report.sitesInspected}</td>
    <td style="padding:14px 18px;font-weight:700;color:${BD_DARK};">Issues found</td>
    <td style="padding:14px 18px;font-size:20px;font-weight:800;color:${report.issues.length > 0 ? "#dc2626" : "#16a34a"};">${report.issues.length}</td>
    <td style="padding:14px 18px;font-weight:700;color:${BD_DARK};">Fixes applied</td>
    <td style="padding:14px 18px;font-size:20px;font-weight:800;color:${successFixes.length > 0 ? "#16a34a" : BD_GREY};">${successFixes.length}</td>
  </tr>
</table>

${
  successFixes.length > 0
    ? `<h2 style="font-size:15px;font-weight:700;color:#16a34a;margin:0 0 8px;">&#9989; Auto-Fixed</h2>
<div style="background:#f0fdf4;border-radius:8px;padding:4px 16px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;">${fixRows}</table>
</div>`
    : ""
}

${
  failedFixes.length > 0
    ? `<h2 style="font-size:15px;font-weight:700;color:#d97706;margin:0 0 8px;">&#9888; Fix Attempts (failed)</h2>
<div style="background:#fffbeb;border-radius:8px;padding:4px 16px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;">${failedRows}</table>
</div>`
    : ""
}

${
  report.flagged.length > 0
    ? `<h2 style="font-size:15px;font-weight:700;color:#dc2626;margin:0 0 8px;">&#128680; Needs Attention</h2>
<div style="background:#fff5f5;border-radius:8px;padding:4px 16px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;">${flaggedRows}</table>
</div>`
    : ""
}

${
  !hasActivity
    ? `<p style="color:#16a34a;font-weight:700;font-size:15px;">&#10003; All clear — no issues found.</p>`
    : ""
}

<p style="font-size:12px;color:${BD_GREY};margin:20px 0 0;">
  Sent by the BuildMy.Directory Site Doctor (cron: every 6 hours).
</p>`;

  const issueCount = report.issues.length;
  const fixCount = successFixes.length;
  const subject =
    issueCount === 0 && fixCount === 0
      ? "Site Doctor: all clear"
      : `Site Doctor: ${issueCount} issue${issueCount !== 1 ? "s" : ""}, ${fixCount} fix${fixCount !== 1 ? "es" : ""} applied`;

  return brandedEmail(content, subject);
}

/**
 * Monitor alert email — sent to platform admins when the health check
 * detects degraded or down services.
 */
// ─── Advertising email templates ─────────────────────────────────────

/**
 * Sent to the advertiser immediately after Stripe confirms payment.
 * Lets them know their creative is in review.
 */
export function adPurchaseConfirmationEmail(opts: {
  advertiserName: string;
  siteName: string;
  slotName: string;
  amount: string; // formatted, e.g. "£25.00"
  reviewWindow: string; // e.g. "48 hours"
}): { subject: string; html: string } {
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">Your ad order is confirmed</h1>
<p style="margin:0 0 20px;">
  Hi ${esc(opts.advertiserName)}, thanks for advertising on <strong>${esc(opts.siteName)}</strong>!
  Your payment of <strong>${esc(opts.amount)}</strong> has been received.
</p>
<div style="background:#f7f5f3;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <p style="margin:0 0 6px;font-size:13px;color:${BD_GREY};">Ad slot</p>
  <p style="margin:0 0 14px;font-size:16px;font-weight:700;">${esc(opts.slotName)}</p>
  <p style="margin:0;font-size:13px;color:${BD_GREY};">Amount charged: <strong>${esc(opts.amount)}</strong></p>
</div>
<p style="margin:0 0 20px;">
  The directory creator will review your creative within <strong>${esc(opts.reviewWindow)}</strong>.
  You&rsquo;ll receive an email the moment your ad goes live.
</p>
<p style="font-size:13px;color:${BD_GREY};margin:0;">
  Questions? Reply to this email or contact us at
  <a href="mailto:hello@buildmy.directory" style="color:${BD_DARK};">hello@buildmy.directory</a>.
</p>`;
  return brandedEmail(content, `Ad order confirmed — ${opts.siteName}`);
}

/**
 * Sent to the creator when a new paid ad lands in their review queue.
 */
export function adPurchaseNotificationEmail(opts: {
  siteName: string;
  advertiserName: string;
  advertiserEmail: string;
  slotName: string;
  amount: string;
  creatorAmount: string;
  inboxUrl: string;
}): { subject: string; html: string } {
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">New ad purchase on ${esc(opts.siteName)}</h1>
<p style="margin:0 0 20px;">
  Someone just bought a <strong>${esc(opts.slotName)}</strong> slot on your directory.
  Review and approve it before it goes live.
</p>
<div style="background:#f7f5f3;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    <tr><td style="padding:4px 0;color:${BD_GREY};width:140px;">Advertiser</td><td style="padding:4px 0;font-weight:600;">${esc(opts.advertiserName)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Email</td><td style="padding:4px 0;">${esc(opts.advertiserEmail)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Slot</td><td style="padding:4px 0;">${esc(opts.slotName)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Amount paid</td><td style="padding:4px 0;font-weight:700;">${esc(opts.amount)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Your cut (90%)</td><td style="padding:4px 0;font-weight:700;color:#16a34a;">${esc(opts.creatorAmount)}</td></tr>
  </table>
</div>
<div style="text-align:center;margin:0 0 16px;">
  <a href="${escUrl(opts.inboxUrl)}" style="display:inline-block;background-color:${BD_LIME};color:${BD_DARK};padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
    Review in dashboard
  </a>
</div>
<p style="font-size:13px;color:${BD_GREY};margin:0;text-align:center;">
  If you reject the ad, a full refund is issued automatically.
</p>`;
  return brandedEmail(content, `New ad on ${opts.siteName} — review required`);
}

/**
 * Sent to the advertiser when the creator approves their ad.
 */
export function adApprovedEmail(opts: {
  advertiserName: string;
  siteName: string;
  siteUrl: string;
  startsAt: string;
  endsAt: string;
}): { subject: string; html: string } {
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">Your ad is live!</h1>
<p style="margin:0 0 20px;">
  Hi ${esc(opts.advertiserName)}, great news — your ad on <strong>${esc(opts.siteName)}</strong> has been approved and is now running.
</p>
<div style="background:#f0fdf4;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <p style="margin:0 0 6px;font-size:13px;color:${BD_GREY};">Campaign window</p>
  <p style="margin:0;font-size:15px;font-weight:700;">${esc(opts.startsAt)} &rarr; ${esc(opts.endsAt)}</p>
</div>
<div style="text-align:center;margin:0 0 16px;">
  <a href="${escUrl(opts.siteUrl)}" style="display:inline-block;background-color:${BD_LIME};color:${BD_DARK};padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
    View the directory
  </a>
</div>
<p style="font-size:13px;color:${BD_GREY};margin:0;text-align:center;">
  Questions? Email us at <a href="mailto:hello@buildmy.directory" style="color:${BD_DARK};">hello@buildmy.directory</a>.
</p>`;
  return brandedEmail(content, `Your ad on ${opts.siteName} is live`);
}

/**
 * Sent to the creator when a new advertiser request arrives (pre-payment).
 * Creator reviews the creative and pricing, then approves or declines.
 * No money has changed hands yet — no refund is needed on decline.
 */
export function adRequestNotificationEmail(opts: {
  siteName: string;
  advertiserName: string;
  advertiserEmail: string;
  advertiserWebsite?: string | null;
  slotName: string;
  amount: string;
  creatorAmount: string;
  weeks: number;
  inboxUrl: string;
}): { subject: string; html: string } {
  const websiteRow = opts.advertiserWebsite
    ? `<tr><td style="padding:4px 0;color:${BD_GREY};">Website</td><td style="padding:4px 0;"><a href="${escUrl(opts.advertiserWebsite)}" style="color:${BD_DARK};">${esc(opts.advertiserWebsite)}</a></td></tr>`
    : "";
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">New ad request on ${esc(opts.siteName)}</h1>
<p style="margin:0 0 20px;">
  An advertiser wants to run a <strong>${esc(opts.slotName)}</strong> on your directory for
  ${opts.weeks} week${opts.weeks === 1 ? "" : "s"}.
  Review their creative in your dashboard &mdash; no payment has been taken. The advertiser only pays after you approve.
</p>
<div style="background:#f7f5f3;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    <tr><td style="padding:4px 0;color:${BD_GREY};width:140px;">Advertiser</td><td style="padding:4px 0;font-weight:600;">${esc(opts.advertiserName)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Email</td><td style="padding:4px 0;">${esc(opts.advertiserEmail)}</td></tr>
    ${websiteRow}
    <tr><td style="padding:4px 0;color:${BD_GREY};">Slot</td><td style="padding:4px 0;">${esc(opts.slotName)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Duration</td><td style="padding:4px 0;">${opts.weeks} week${opts.weeks === 1 ? "" : "s"}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Quoted amount</td><td style="padding:4px 0;font-weight:700;">${esc(opts.amount)}</td></tr>
    <tr><td style="padding:4px 0;color:${BD_GREY};">Your cut (90%)</td><td style="padding:4px 0;font-weight:700;color:#16a34a;">${esc(opts.creatorAmount)}</td></tr>
  </table>
</div>
<div style="text-align:center;margin:0 0 16px;">
  <a href="${escUrl(opts.inboxUrl)}" style="display:inline-block;background-color:${BD_LIME};color:${BD_DARK};padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
    Review in dashboard
  </a>
</div>
<p style="font-size:13px;color:${BD_GREY};margin:0;text-align:center;">
  The advertiser pays only after you approve. Decline sends an automated email &mdash; no refund needed.
</p>`;
  return brandedEmail(content, `New ad request on ${opts.siteName}`);
}

/**
 * Sent to the advertiser when the creator approves their request.
 * Contains a one-time Stripe Checkout link to complete payment.
 */
export function adApprovalPaymentEmail(opts: {
  advertiserName: string;
  siteName: string;
  slotName: string;
  amount: string;
  weeks: number;
  checkoutUrl: string;
}): { subject: string; html: string } {
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">Your ad request was approved!</h1>
<p style="margin:0 0 20px;">
  Hi ${esc(opts.advertiserName)}, the creator of <strong>${esc(opts.siteName)}</strong> has approved your
  <strong>${esc(opts.slotName)}</strong> for ${opts.weeks} week${opts.weeks === 1 ? "" : "s"}.
  Click below to complete payment and your ad will go live immediately.
</p>
<div style="background:#f7f5f3;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <p style="margin:0 0 6px;font-size:13px;color:${BD_GREY};">Amount due</p>
  <p style="margin:0;font-size:24px;font-weight:800;color:${BD_DARK};">${esc(opts.amount)}</p>
</div>
<div style="text-align:center;margin:0 0 16px;">
  <a href="${escUrl(opts.checkoutUrl)}" style="display:inline-block;background-color:${BD_LIME};color:${BD_DARK};padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
    Pay ${esc(opts.amount)} with Stripe
  </a>
</div>
<p style="font-size:13px;color:${BD_GREY};margin:0;text-align:center;">
  Questions? Reply to this email or contact
  <a href="mailto:hello@buildmy.directory" style="color:${BD_DARK};">hello@buildmy.directory</a>.
</p>`;
  return brandedEmail(content, `Your ad request on ${opts.siteName} was approved — pay to go live`);
}

/**
 * Sent to the advertiser when the creator declines a pre-payment request.
 * No refund &mdash; no payment was taken in the first place.
 */
export function adDeclinedEmail(opts: {
  advertiserName: string;
  siteName: string;
  reason?: string;
}): { subject: string; html: string } {
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">Your ad request was declined</h1>
<p style="margin:0 0 20px;">
  Hi ${esc(opts.advertiserName)}, unfortunately the creator of <strong>${esc(opts.siteName)}</strong>
  was unable to approve your ad request. No payment was taken.
</p>
${opts.reason ? `
<div style="background:#fff5f5;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
  <p style="margin:0 0 4px;font-size:13px;color:${BD_GREY};">Reason</p>
  <p style="margin:0;font-size:14px;">${esc(opts.reason)}</p>
</div>` : ""}
<p style="font-size:13px;color:${BD_GREY};margin:0;">
  Questions? Email us at <a href="mailto:hello@buildmy.directory" style="color:${BD_DARK};">hello@buildmy.directory</a>.
</p>`;
  return brandedEmail(content, `Ad request declined — ${opts.siteName}`);
}

/**
 * Sent to the advertiser when the creator rejects their ad.
 * Includes refund notice.
 */
export function adRejectedEmail(opts: {
  advertiserName: string;
  siteName: string;
  reason?: string;
  refundAmount: string;
}): { subject: string; html: string } {
  const content = `
<h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:${BD_DARK};">Your ad was not approved</h1>
<p style="margin:0 0 20px;">
  Hi ${esc(opts.advertiserName)}, unfortunately the creator of <strong>${esc(opts.siteName)}</strong>
  was unable to approve your ad at this time.
</p>
${opts.reason ? `
<div style="background:#fff5f5;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
  <p style="margin:0 0 4px;font-size:13px;color:${BD_GREY};">Reason</p>
  <p style="margin:0;font-size:14px;">${esc(opts.reason)}</p>
</div>` : ""}
<div style="background:#f0fdf4;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <p style="margin:0 0 6px;font-size:13px;color:${BD_GREY};">Refund issued</p>
  <p style="margin:0;font-size:18px;font-weight:800;color:#16a34a;">${esc(opts.refundAmount)}</p>
  <p style="margin:6px 0 0;font-size:13px;color:${BD_GREY};">Your payment has been fully refunded. It may take 5–10 business days to appear on your statement.</p>
</div>
<p style="font-size:13px;color:${BD_GREY};margin:0;">
  Questions? Contact us at <a href="mailto:hello@buildmy.directory" style="color:${BD_DARK};">hello@buildmy.directory</a>.
</p>`;
  return brandedEmail(content, `Ad refunded — ${opts.siteName}`);
}

export function monitorAlertEmail(opts: {
  severity: "info" | "warning" | "critical";
  services: { service: string; status: string; latencyMs: number; message: string }[];
  healActions: { success: boolean; action: string; detail: string }[];
  timestamp: string;
}): { subject: string; html: string } {
  const sevColor: Record<string, string> = {
    info: "#2563eb",
    warning: "#d97706",
    critical: "#dc2626",
  };
  const color = sevColor[opts.severity] ?? BD_DARK;
  const sevLabel = opts.severity.toUpperCase();

  const statusDot = (s: string) => {
    if (s === "ok") return `<span style="color:#16a34a;">&#9679;</span>`;
    if (s === "degraded") return `<span style="color:#d97706;">&#9679;</span>`;
    return `<span style="color:#dc2626;">&#9679;</span>`;
  };

  const serviceRows = opts.services
    .map(
      (s) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">${statusDot(s.status)} ${esc(s.service)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;color:${s.status === "ok" ? "#16a34a" : s.status === "degraded" ? "#d97706" : "#dc2626"};">${esc(s.status)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;color:${BD_GREY};">${s.latencyMs}ms</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;color:${BD_GREY};font-size:13px;">${esc(s.message)}</td>
        </tr>`,
    )
    .join("");

  const healRows =
    opts.healActions.length > 0
      ? opts.healActions
          .map(
            (h) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">${h.success ? "&#10003;" : "&#10007;"} ${esc(h.action)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:${BD_GREY};">${esc(h.detail)}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="2" style="padding:8px;color:${BD_GREY};">No automatic actions taken.</td></tr>`;

  const needsAttention = opts.services
    .filter((s) => s.status !== "ok")
    .map((s) => `<li style="margin-bottom:4px;">${esc(s.service)}: ${esc(s.message)}</li>`)
    .join("");

  const content = `
<h1 style="font-size:22px;font-weight:800;margin:0 0 4px;color:${BD_DARK};">
  Platform Health Alert
</h1>
<p style="margin:0 0 20px;">
  <span style="display:inline-block;background-color:${color};color:#fff;font-size:12px;font-weight:700;padding:2px 10px;border-radius:12px;letter-spacing:.5px;">${esc(sevLabel)}</span>
  &nbsp;<span style="color:${BD_GREY};font-size:13px;">${esc(opts.timestamp)}</span>
</p>

<h2 style="font-size:15px;font-weight:700;margin:0 0 10px;color:${BD_DARK};">Service Status</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
  <thead>
    <tr style="background:#f7f5f3;">
      <th style="padding:6px 8px;text-align:left;font-size:12px;color:${BD_GREY};">Service</th>
      <th style="padding:6px 8px;text-align:left;font-size:12px;color:${BD_GREY};">Status</th>
      <th style="padding:6px 8px;text-align:left;font-size:12px;color:${BD_GREY};">Latency</th>
      <th style="padding:6px 8px;text-align:left;font-size:12px;color:${BD_GREY};">Message</th>
    </tr>
  </thead>
  <tbody>${serviceRows}</tbody>
</table>

<h2 style="font-size:15px;font-weight:700;margin:0 0 10px;color:${BD_DARK};">Auto-Heal Actions</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
  <tbody>${healRows}</tbody>
</table>

${
  needsAttention
    ? `<h2 style="font-size:15px;font-weight:700;margin:0 0 8px;color:#dc2626;">Needs Attention</h2>
<ul style="padding-left:20px;margin:0 0 20px;font-size:14px;color:#333;">${needsAttention}</ul>`
    : ""
}

<p style="font-size:13px;color:${BD_GREY};margin:0;">
  This alert was sent by the BuildMy.Directory self-healing monitor. It runs every 5 minutes via Inngest.
</p>`;

  return brandedEmail(content, `[${sevLabel}] BuildMy.Directory health alert`);
}
