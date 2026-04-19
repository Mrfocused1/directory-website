/**
 * Notifications for the manual build-operator workflow.
 *
 * BuildMy.Directory currently runs builds manually (the scrape +
 * transcribe + categorize + references pipeline has too many
 * fragile dependencies to be self-serve yet). When a creator clicks
 * "Build my directory" we fire an operator ping via email AND
 * telegram; the operator then runs `bash scripts/build-site.sh <slug>`
 * on their Mac to execute the actual pipeline.
 */

import { resend } from "@/lib/email/resend";
import { sendTelegramMessage } from "./telegram";

const ALERT_EMAIL = process.env.BUILD_OPERATOR_EMAIL || process.env.SESSION_RECOVERY_ALERT_EMAIL;

export type BuildRequestPayload = {
  siteId: string;
  slug: string;
  platform: string;
  handle: string;
  displayName: string;
  userEmail?: string | null;
  plan?: string;
  postLimit?: number;
};

/**
 * Ping the operator (you) that a creator has requested a build.
 * Sent in parallel to both channels; a failure on either is logged
 * but doesn't affect the other. Returns the HTTP-style outcomes so
 * the caller can decide whether to retry.
 */
export async function notifyBuildRequested(payload: BuildRequestPayload) {
  const { siteId, slug, platform, handle, displayName, userEmail, plan, postLimit } = payload;

  const summary = [
    `*New directory build requested*`,
    ``,
    `*Creator:* ${escapeMarkdown(displayName)} (${userEmail || "no email"})`,
    `*Platform:* ${platform}`,
    `*Handle:* @${escapeMarkdown(handle)}`,
    `*Slug:* ${escapeMarkdown(slug)}`,
    `*Plan:* ${plan || "free"}${postLimit ? ` (${postLimit} posts)` : ""}`,
    ``,
    `Run on your Mac:`,
    "```",
    `bash scripts/build-site.sh ${slug}`,
    "```",
    ``,
    `Or skip to the site: https://buildmy.directory/${slug}`,
  ].join("\n");

  const [telegramOk, emailOk] = await Promise.all([
    sendTelegramMessage(summary),
    sendOperatorEmail(payload),
  ]);

  return { telegramOk, emailOk };
}

async function sendOperatorEmail(payload: BuildRequestPayload): Promise<boolean> {
  if (!resend || !ALERT_EMAIL) return false;
  const { siteId, slug, platform, handle, displayName, userEmail, plan, postLimit } = payload;
  const subject = `[BuildMy.Directory] New build request: @${handle}`;
  const text = `
A creator has requested a directory build.

Creator:  ${displayName} <${userEmail || "no email"}>
Platform: ${platform}
Handle:   @${handle}
Slug:     ${slug}
Plan:     ${plan || "free"}${postLimit ? ` (${postLimit} posts)` : ""}
Site ID:  ${siteId}

To build, run on your Mac:
  bash scripts/build-site.sh ${slug}

Site will be at: https://buildmy.directory/${slug}
`.trim();

  try {
    await resend.emails.send({
      from: "BuildMy.Directory <alerts@buildmy.directory>",
      to: ALERT_EMAIL,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.warn("[build-request] operator email failed:", err);
    return false;
  }
}

/**
 * Escape Markdown special chars so usernames/names with underscores
 * (which are common) don't accidentally italicize half the message.
 */
function escapeMarkdown(s: string): string {
  return (s || "").replace(/([_*`\[\]()])/g, "\\$1");
}
