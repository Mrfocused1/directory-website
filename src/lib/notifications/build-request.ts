/**
 * Notifications for the manual build-operator workflow.
 *
 * When a creator clicks "Build my directory" we fire an operator ping
 * via email AND telegram. The telegram message contains a
 * copy-pasteable Claude prompt the operator can feed into Claude Code
 * (on Mac) or the claude.ai mobile app to drive the build end-to-end.
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
 * but doesn't affect the other.
 */
export async function notifyBuildRequested(payload: BuildRequestPayload) {
  const { slug, platform, handle, displayName, userEmail, plan, postLimit } = payload;

  // Telegram has a 4096-char cap per message — keep the header
  // compact so the full Claude prompt fits comfortably below.
  // Plain text only: the Claude prompt body contains ** markers, dots,
  // parens, backticks, dashes — all of which break Telegram Markdown.
  const header = [
    `🆕 NEW BUILD REQUESTED`,
    `${displayName} · ${userEmail || "no email"}`,
    `@${handle} · ${platform} · ${plan || "creator"}${postLimit ? ` (${postLimit})` : ""}`,
    ``,
    `📋 Copy everything below into Claude:`,
    `—————————————————————`,
  ].join("\n");

  const claudePrompt = buildClaudePrompt(payload);

  const fullMessage = `${header}\n\n${claudePrompt}`;

  const [telegramOk, emailOk] = await Promise.all([
    sendTelegramMessage(fullMessage, { plain: true }),
    sendOperatorEmail(payload, claudePrompt),
  ]);

  return { telegramOk, emailOk };
}

/**
 * The full prompt the operator pastes into Claude. Deliberately
 * self-contained: all site info, build command, quality bars, and
 * verification steps live in one place so Claude doesn't need any
 * other context to drive the run.
 */
function buildClaudePrompt(payload: BuildRequestPayload): string {
  const { siteId, slug, handle, displayName, userEmail, postLimit } = payload;
  const cap = postLimit || 500;

  return [
    `Build a new BuildMy.Directory site. Here are all the details:`,
    ``,
    `**Creator:** ${displayName} <${userEmail || "no email"}>`,
    `**Instagram handle:** @${handle}`,
    `**Slug:** ${slug}`,
    `**Site ID:** ${siteId}`,
    `**Plan cap:** ${cap} posts`,
    `**Final URL:** https://buildmy.directory/${slug}`,
    ``,
    `## Run the build`,
    ``,
    `From the project root \`/Users/paulbridges/Desktop/new directory/directory-website\`:`,
    ``,
    `\`\`\``,
    `bash scripts/build-site.sh ${slug}`,
    `\`\`\``,
    ``,
    `This fires the pipeline/run Inngest event and tails the DB until every step completes. On success it emails the creator.`,
    ``,
    `## Quality bars for each pipeline step`,
    ``,
    `**1. Scrape** (via VPS Puppeteer + stored IG session cookies)`,
    `- Target: up to ${cap} posts. Active creators usually return 150-500.`,
    `- If <20 posts come back, the session is probably flagged — run \`bash scripts/ig-session-refresh.sh\` first, then retry.`,
    ``,
    `**2. Upload media** (R2, 10 concurrent)`,
    `- Every post needs mediaUrl + thumbUrl populated.`,
    `- Failures here usually mean an IG CDN URL expired. Normal loss rate: <5%.`,
    ``,
    `**3. Transcribe videos** (Groq → Deepgram fallback)`,
    `- Aim for ≥75% of videos transcribed with ≥50 chars of text.`,
    `- Music-only reels legitimately fail — acceptable if ≤25% failure rate.`,
    `- Each Groq call caps at 3 min; longer videos fall through to Deepgram.`,
    ``,
    `**4. Talking points** (Claude Haiku on the transcript)`,
    `- Replaces raw 30-sec transcript chunks with numbered tips / topic transitions.`,
    `- Optional — if it fails, raw chunks stay as fallback.`,
    ``,
    `**5. Categorize** (Claude Haiku on captions + transcripts)`,
    `- Detect 4-7 niche-specific categories (not generic "Updates").`,
    `- Every post gets a category. "Uncategorized" is OK for truly off-topic posts but should stay under ~5% of the total.`,
    ``,
    `**6. References** (Claude picks search queries → SearXNG → English filter)`,
    `- Target 6-8 references per substantive post.`,
    `- Only English TLDs (.com/.org/.net/.edu/.gov/.io/.co/.uk/.us/.ca/.au/.nz/.ie/.in etc.).`,
    `- Reject foreign-locale TLDs (.de, .fr, .cn, .jp, .kr, .ru, .tw, .vn, .th, plus baidu/yandex/zhihu).`,
    `- Relevance: result title must share ≥1 non-stopword with the search query.`,
    `- Dedupe per post by URL / video ID / normalized title.`,
    `- Filler posts (greetings, podcast ads, "Happy Sunday") can stay at 0 refs.`,
    ``,
    `**7. Publish**`,
    `- sites.isPublished = true, sites.lastSyncAt stamped.`,
    `- /${slug} CDN path revalidated.`,
    `- Creator emailed a "your directory is live" message.`,
    ``,
    `## If something fails`,
    ``,
    `- **Session dead:** run \`bash scripts/ig-session-refresh.sh\`, then retry the build.`,
    `- **Anthropic 400/429:** top up at https://console.anthropic.com/settings/billing, then re-run just the failing step (scripts/backfill-refs-*.mjs pattern works for refs).`,
    `- **VPS unreachable:** ssh to root@46.224.45.79, systemctl restart scraper.`,
    `- **Pipeline stuck at running 0%:** Vercel function timed out mid-scrape. The monitor should auto-clean it after 10 min; kick \`bash scripts/build-site.sh ${slug}\` again to retry.`,
    ``,
    `Verify the final site at https://buildmy.directory/${slug} — open a couple of posts, check transcript + references + categories look right. Then we're done.`,
  ].join("\n");
}

async function sendOperatorEmail(payload: BuildRequestPayload, claudePrompt: string): Promise<boolean> {
  if (!resend) {
    console.warn("[build-request] RESEND_API_KEY not set, skipping operator email");
    return false;
  }
  if (!ALERT_EMAIL) {
    console.warn("[build-request] BUILD_OPERATOR_EMAIL/SESSION_RECOVERY_ALERT_EMAIL not set, skipping operator email");
    return false;
  }
  const { siteId, slug, platform, handle, displayName, userEmail, plan, postLimit } = payload;
  const subject = `[BuildMy.Directory] New build request: @${handle}`;
  const text = `
A creator has requested a directory build.

Creator:  ${displayName} <${userEmail || "no email"}>
Platform: ${platform}
Handle:   @${handle}
Slug:     ${slug}
Plan:     ${plan || "creator"}${postLimit ? ` (${postLimit} posts)` : ""}
Site ID:  ${siteId}

Site will be at: https://buildmy.directory/${slug}

----------------------------------------
Paste the prompt below into Claude:
----------------------------------------

${claudePrompt}
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

