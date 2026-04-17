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
export function signupConfirmEmail(opts: { confirmUrl: string }) {
  return brandedEmail(
    `<h1 style="font-size: 24px; font-weight: 800; color: ${BD_DARK}; margin: 0 0 8px;">Welcome to BuildMy.Directory</h1>
    <p style="color: ${BD_GREY}; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
      You're one click away from turning your content into a beautiful, searchable directory. Confirm your email to get started.
    </p>
    <div style="text-align: center; margin: 0 0 28px;">
      <a href="${escUrl(opts.confirmUrl)}" style="display: inline-block; background: ${BD_LIME}; color: ${BD_DARK}; padding: 14px 36px; border-radius: 50px; font-size: 14px; font-weight: 700; text-decoration: none;">
        Confirm my email
      </a>
    </div>
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
          Share the link with your audience — and come back anytime to see analytics, manage subscribers, or answer content requests.
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
