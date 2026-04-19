import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/db";
import { sites, adSlots, users, posts } from "@/db/schema";
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

  const [{ value: postCount }] = await db
    .select({ value: count() })
    .from(posts)
    .where(eq(posts.siteId, site.id));

  const slotRows = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.siteId, site.id), eq(adSlots.enabled, true)));

  const enabledSlotMap = Object.fromEntries(slotRows.map((r) => [r.slotType, r]));

  const [creator] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, site.userId))
    .limit(1);

  const availableSlots = SLOT_TYPES.filter(
    (def) => def.status === "live" && enabledSlotMap[def.id],
  ).map((def) => ({ def, row: enabledSlotMap[def.id]! }));

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
    description: `Reach the audience of ${siteName}. Explore ad formats and request pricing.`,
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
      {/* Top nav */}
      <header className="bg-[#1a0a2e] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Link href={`/${tenant}`} className="text-sm text-white/60 hover:text-white transition">
            &larr; Back to {siteName}
          </Link>
          <Link
            href="/"
            aria-label="BuildMy.Directory home"
            className="text-xs text-white/50 hover:text-white tracking-wide uppercase transition"
          >
            BuildMy.Directory
          </Link>
        </div>
      </header>

      {/* Hero — gradient + avatar + split layout */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1a0a2e] via-[#2a1248] to-[#1a0a2e] text-white">
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{
          background:
            "radial-gradient(60% 80% at 85% 20%, rgba(168,85,247,0.35) 0%, transparent 60%), " +
            "radial-gradient(50% 60% at 15% 80%, rgba(59,130,246,0.25) 0%, transparent 60%)",
        }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8">
            {site.avatarUrl && (
              <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-2 ring-white/20 shadow-lg">
                <Image
                  src={site.avatarUrl}
                  alt={siteName}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase text-purple-300/90 mb-2">
                Advertising opportunities
              </p>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
                Advertise on <span className="text-purple-300">{siteName}</span>
              </h1>
              <p className="text-white/70 text-base sm:text-lg mt-4 max-w-xl leading-relaxed">
                Reach a curated audience that trusts {creatorName}. Explore the formats below, then request pricing to get started.
              </p>
              <div className="flex flex-wrap gap-8 mt-8">
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold">{postCount.toLocaleString()}</p>
                  <p className="text-xs sm:text-sm text-white/60 mt-0.5">posts indexed</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold">{availableSlots.length}</p>
                  <p className="text-xs sm:text-sm text-white/60 mt-0.5">ad format{availableSlots.length === 1 ? "" : "s"}</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold">1:1</p>
                  <p className="text-xs sm:text-sm text-white/60 mt-0.5">creator review</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Slot grid */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {availableSlots.length === 0 ? (
          <div className="bg-white border border-[#e5e1da] rounded-2xl p-10 text-center">
            <p className="text-lg font-bold text-[#1a0a2e] mb-2">Ad formats coming soon</p>
            <p className="text-sm text-[#56505e] max-w-md mx-auto">
              {creatorName} hasn&apos;t opened any ad formats on this directory yet. Check back soon.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-[#1a0a2e] mb-1">Available formats</h2>
            <p className="text-sm text-[#56505e] mb-6">Click any format to see a live preview and request pricing.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableSlots.map(({ def, row }) => (
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
                      <p className="text-sm font-semibold text-[#1a0a2e]">Pricing on request</p>
                      <p className="text-xs text-[#56505e]">
                        {row.minWeeks}–{row.maxWeeks} week booking
                      </p>
                    </div>
                    <Link
                      href={`/${tenant}/advertise/${def.id}`}
                      className="inline-flex items-center h-9 px-5 bg-[#1a0a2e] text-white text-sm font-semibold rounded-full hover:opacity-90 transition"
                    >
                      Request pricing
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-[#56505e] text-center mt-12 max-w-lg mx-auto">
          Every ad is reviewed by {creatorName} before it goes live. Payments secured by Stripe.
        </p>
      </main>
    </div>
  );
}
