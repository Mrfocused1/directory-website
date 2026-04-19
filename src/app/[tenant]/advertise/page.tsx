import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/db";
import { sites, adSlots, stripeConnectAccounts, users, posts } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";
import { SLOT_COPY } from "@/lib/advertising/slot-copy";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

type Props = { params: Promise<{ tenant: string }> };

async function getAdvertisePage(slug: string) {
  if (!db) return null;

  const [site] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      displayName: sites.displayName,
      bio: sites.bio,
      avatarUrl: sites.avatarUrl,
      isPublished: sites.isPublished,
      userId: sites.userId,
    })
    .from(sites)
    .where(and(eq(sites.slug, slug), eq(sites.isPublished, true)))
    .limit(1);

  if (!site) return null;

  // Check creator has an active Stripe Connect account
  const [connectAccount] = await db
    .select({ chargesEnabled: stripeConnectAccounts.chargesEnabled })
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.userId, site.userId))
    .limit(1);

  if (!connectAccount?.chargesEnabled) return null;

  // Fetch post count for stats
  const [{ value: postCount }] = await db
    .select({ value: count() })
    .from(posts)
    .where(eq(posts.siteId, site.id));

  // Fetch enabled slots
  const slotRows = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.siteId, site.id), eq(adSlots.enabled, true)));

  const enabledSlotMap = Object.fromEntries(slotRows.map((r) => [r.slotType, r]));

  // Creator display name (for footer attribution)
  const [creator] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, site.userId))
    .limit(1);

  // Zip slot catalog — only live + enabled
  const availableSlots = SLOT_TYPES.filter(
    (def) => def.status === "live" && enabledSlotMap[def.id],
  ).map((def) => ({
    def,
    row: enabledSlotMap[def.id]!,
  }));

  return {
    site,
    postCount: Number(postCount),
    availableSlots,
    creatorName: creator?.name || site.displayName || slug,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getAdvertisePage(tenant);
  if (!data) return { title: "Not Found" };
  const siteName = data.site.displayName || tenant;
  return {
    title: `Advertise on ${siteName}`,
    description: `Reach the audience of ${siteName}. Choose an ad slot, upload your creative, and pay securely via Stripe.`,
    alternates: { canonical: `${SITE_URL}/${tenant}/advertise` },
  };
}

export default async function AdvertiseLandingPage({ params }: Props) {
  const { tenant } = await params;
  const data = await getAdvertisePage(tenant);
  if (!data) notFound();

  const { site, postCount, availableSlots, creatorName } = data;
  const siteName = site.displayName || tenant;

  return (
    <div className="min-h-screen bg-[#f7f5f3]">
      {/* Header */}
      <header className="bg-[#1a0a2e] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <Link href={`/${tenant}`} className="text-sm text-white/60 hover:text-white transition">
            &larr; Back to {siteName}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#1a0a2e] text-white pb-16 pt-4">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Advertise on {siteName}
          </h1>
          <p className="text-white/70 text-lg max-w-xl">
            Reach a curated audience of engaged readers. Pick a slot, upload your creative, and pay securely via Stripe. The creator reviews every ad before it goes live.
          </p>
          {/* Stats */}
          <div className="flex flex-wrap gap-6 mt-8">
            <div>
              <p className="text-2xl font-extrabold">{postCount.toLocaleString()}</p>
              <p className="text-sm text-white/60">posts indexed</p>
            </div>
          </div>
        </div>
      </section>

      {/* Slot grid */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {availableSlots.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-semibold mb-2">No ad slots available right now</p>
            <p className="text-sm text-[#56505e]">
              The creator hasn&apos;t enabled any ad slots yet. Check back soon.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-6">Available ad slots</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableSlots.map(({ def, row }) => {
                const pricePerWeek = (row.pricePerWeekCents ?? def.defaultPriceCents) / 100;
                return (
                  <div
                    key={def.id}
                    className="bg-white border border-[#e5e1da] rounded-2xl p-5 flex flex-col gap-3"
                  >
                    <div>
                      <p className="font-bold text-[#1a0a2e]">{def.name}</p>
                      <p className="text-sm text-[#56505e] mt-0.5">{def.tagline}</p>
                    </div>
                    <p className="text-xs text-[#56505e] leading-relaxed line-clamp-3">
                      {SLOT_COPY[def.id]}
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-2">
                      <div>
                        <p className="text-lg font-extrabold text-[#1a0a2e]">
                          £{pricePerWeek.toFixed(0)}<span className="text-sm font-normal text-[#56505e]">/week</span>
                        </p>
                        <p className="text-xs text-[#56505e]">
                          {row.minWeeks}–{row.maxWeeks} weeks
                        </p>
                      </div>
                      <Link
                        href={`/${tenant}/advertise/${def.id}`}
                        className="inline-flex items-center h-9 px-5 bg-[#1a0a2e] text-white text-sm font-semibold rounded-full hover:opacity-90 transition"
                      >
                        Buy
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer trust copy */}
        <p className="text-xs text-[#56505e] text-center mt-12 max-w-lg mx-auto">
          Payments secured by Stripe. All ads reviewed by {creatorName} before going live.
          10% platform fee supports BuildMy.Directory.
        </p>
      </main>
    </div>
  );
}
