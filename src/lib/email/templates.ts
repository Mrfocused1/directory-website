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

/** Escape a URL for safe use in href attributes (ensures https and escapes quotes) */
function escUrl(url: string): string {
  // Only allow http(s) URLs
  if (!/^https?:\/\//i.test(url)) return "#";
  return url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
          <a href="${escUrl(opts.unsubscribeUrl)}" style="color: #999;">Unsubscribe</a>
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
