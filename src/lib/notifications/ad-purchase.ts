/**
 * Notifications fired when an ad purchase lands or changes state.
 *
 * Mirrors the build-request pattern: both Telegram (operator) and
 * email (creator / advertiser) fired in parallel, non-blocking.
 */

import { resend } from "@/lib/email/resend";
import { sendTelegramMessage } from "./telegram";
import {
  adPurchaseConfirmationEmail,
  adPurchaseNotificationEmail,
  adApprovedEmail,
  adRejectedEmail,
} from "@/lib/email/templates";

const ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://buildmy.directory";

function formatGBP(cents: number): string {
  return `£${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type AdPurchasePayload = {
  adId: string;
  siteId: string;
  siteSlug: string;
  siteName: string;
  creatorEmail: string;
  advertiserName: string;
  advertiserEmail: string;
  slotName: string;
  amountCents: number;
  creatorAmountCents: number;
};

/**
 * Fire when a new ad clears Stripe payment. Notifies:
 * - The creator via email + Telegram (review prompt)
 * - The advertiser via email (purchase confirmation)
 */
export async function notifyAdPurchased(payload: AdPurchasePayload) {
  const {
    adId,
    siteSlug,
    siteName,
    creatorEmail,
    advertiserName,
    advertiserEmail,
    slotName,
    amountCents,
    creatorAmountCents,
  } = payload;

  const inboxUrl = `${ORIGIN}/dashboard/advertising/inbox`;
  const amount = formatGBP(amountCents);
  const creatorAmount = formatGBP(creatorAmountCents);

  // 1. Telegram ping to operator/creator — quick summary
  const tgMessage = [
    `*New ad purchase*`,
    `*${siteName}* · ${slotName}`,
    `Advertiser: ${advertiserName} (${advertiserEmail})`,
    `Amount: ${amount} → creator gets ${creatorAmount}`,
    ``,
    `Review: ${inboxUrl}`,
  ].join("\n");

  // 2. Creator email
  const creatorTemplate = adPurchaseNotificationEmail({
    siteName,
    advertiserName,
    advertiserEmail,
    slotName,
    amount,
    creatorAmount,
    inboxUrl,
  });

  // 3. Advertiser confirmation email
  const advertiserTemplate = adPurchaseConfirmationEmail({
    advertiserName,
    siteName,
    slotName,
    amount,
    reviewWindow: "48 hours",
  });

  await Promise.all([
    sendTelegramMessage(tgMessage).catch(() => null),
    resend
      ? resend.emails
          .send({
            from: "BuildMy.Directory <hello@buildmy.directory>",
            to: creatorEmail,
            subject: creatorTemplate.subject,
            html: creatorTemplate.html,
          })
          .catch((e) => console.warn("[ad-purchase] creator email failed:", e))
      : Promise.resolve(),
    resend
      ? resend.emails
          .send({
            from: "BuildMy.Directory <hello@buildmy.directory>",
            to: advertiserEmail,
            subject: advertiserTemplate.subject,
            html: advertiserTemplate.html,
          })
          .catch((e) =>
            console.warn("[ad-purchase] advertiser confirmation email failed:", e),
          )
      : Promise.resolve(),
  ]);
}

/**
 * Fire when creator approves an ad. Notifies the advertiser.
 */
export async function notifyAdApproved(opts: {
  advertiserName: string;
  advertiserEmail: string;
  siteName: string;
  siteSlug: string;
  startsAt: Date;
  endsAt: Date;
}) {
  if (!resend) return;
  const template = adApprovedEmail({
    advertiserName: opts.advertiserName,
    siteName: opts.siteName,
    siteUrl: `${ORIGIN}/${opts.siteSlug}`,
    startsAt: formatDate(opts.startsAt),
    endsAt: formatDate(opts.endsAt),
  });
  await resend.emails
    .send({
      from: "BuildMy.Directory <hello@buildmy.directory>",
      to: opts.advertiserEmail,
      subject: template.subject,
      html: template.html,
    })
    .catch((e) => console.warn("[ad-purchase] approve email failed:", e));
}

/**
 * Fire when creator rejects an ad. Notifies the advertiser with
 * refund details.
 */
export async function notifyAdRejected(opts: {
  advertiserName: string;
  advertiserEmail: string;
  siteName: string;
  refundAmountCents: number;
  reason?: string;
}) {
  if (!resend) return;
  const template = adRejectedEmail({
    advertiserName: opts.advertiserName,
    siteName: opts.siteName,
    reason: opts.reason,
    refundAmount: formatGBP(opts.refundAmountCents),
  });
  await resend.emails
    .send({
      from: "BuildMy.Directory <hello@buildmy.directory>",
      to: opts.advertiserEmail,
      subject: template.subject,
      html: template.html,
    })
    .catch((e) => console.warn("[ad-purchase] reject email failed:", e));
}
