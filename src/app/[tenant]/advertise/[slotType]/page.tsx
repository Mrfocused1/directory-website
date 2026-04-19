import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/db";
import { sites, adSlots, stripeConnectAccounts, posts } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";
import { SLOT_COPY } from "@/lib/advertising/slot-copy";
import SlotDemo, { type DemoPost, type DemoSite } from "@/components/advertising/SlotDemo";
import AdBuyForm from "./AdBuyForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tenant: string; slotType: string }> };

async function getSlotData(slug: string, slotTypeId: string) {
  if (!db) return null;

  const slotDef = SLOT_TYPES.find((s) => s.id === slotTypeId);
  if (!slotDef || slotDef.status === "coming_soon") return null;

  const [site] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      displayName: sites.displayName,
      avatarUrl: sites.avatarUrl,
      accentColor: sites.accentColor,
      isPublished: sites.isPublished,
      userId: sites.userId,
    })
    .from(sites)
    .where(and(eq(sites.slug, slug), eq(sites.isPublished, true)))
    .limit(1);

  if (!site) return null;

  const [connectAccount] = await db
    .select({ chargesEnabled: stripeConnectAccounts.chargesEnabled })
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.userId, site.userId))
    .limit(1);

  if (!connectAccount?.chargesEnabled) return null;

  const [slotRow] = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.siteId, site.id), eq(adSlots.slotType, slotTypeId)))
    .limit(1);

  if (!slotRow || !slotRow.enabled || slotRow.pricePerWeekCents === null) return null;

  // Fetch recent posts to feed the animated demo. We keep posts without
  // thumbnails too — the Thumb component renders a coloured tile as
  // fallback, so a title-only post is still usable.
  const samplePosts = await db
    .select({
      thumbUrl: posts.thumbUrl,
      title: posts.title,
      category: posts.category,
    })
    .from(posts)
    .where(and(eq(posts.siteId, site.id), eq(posts.isVisible, true)))
    .orderBy(desc(posts.takenAt))
    .limit(12);

  return { site, slotDef, slotRow, samplePosts };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant, slotType } = await params;
  const data = await getSlotData(tenant, slotType);
  if (!data) return { title: "Not Found" };
  const siteName = data.site.displayName || tenant;
  return {
    title: `Buy ${data.slotDef.name} on ${siteName}`,
    description: `${data.slotDef.tagline} — advertise on ${siteName} from £${((data.slotRow.pricePerWeekCents ?? data.slotDef.defaultPriceCents) / 100).toFixed(0)}/week.`,
  };
}

export default async function AdBuyPage({ params }: Props) {
  const { tenant, slotType } = await params;
  const data = await getSlotData(tenant, slotType);
  if (!data) notFound();

  const { site, slotDef, slotRow, samplePosts } = data;
  const siteName = site.displayName || tenant;

  const demoSite: DemoSite = {
    slug: site.slug,
    displayName: siteName,
    avatarUrl: site.avatarUrl ?? null,
    accentColor: site.accentColor || "#1a0a2e",
  };
  const demoPosts: DemoPost[] = samplePosts.map((p) => ({
    thumbUrl: p.thumbUrl,
    title: p.title ?? "",
    category: p.category ?? "",
  }));

  return (
    <div className="min-h-screen bg-[#f7f5f3]">
      {/* Header */}
      <header className="bg-[#1a0a2e] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <Link
            href={`/${tenant}/advertise`}
            className="text-sm text-white/60 hover:text-white transition"
          >
            &larr; All slots on {siteName}
          </Link>
        </div>
      </header>

      <div className="bg-[#1a0a2e] text-white pb-12 pt-4">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {slotDef.name} on {siteName}
          </h1>
          <p className="text-white/70 mt-2">{slotDef.tagline}</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Live demo — shows the advertiser what they're buying */}
        <section className="bg-white border border-[#e5e1da] rounded-2xl p-6">
          <p className="text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-4">
            What your ad will look like
          </p>
          <SlotDemo
            slotType={slotDef.id}
            site={demoSite}
            samplePosts={demoPosts}
            realBackdropSlug={tenant}
          />
          <p className="text-sm text-[#56505e] leading-relaxed mt-6">
            {SLOT_COPY[slotDef.id]}
          </p>
        </section>

        <AdBuyForm
          siteId={site.id}
          slug={tenant}
          slotType={slotDef.id}
          slotName={slotDef.name}
          pricePerWeekCents={slotRow.pricePerWeekCents ?? slotDef.defaultPriceCents}
          minWeeks={slotRow.minWeeks}
          maxWeeks={slotRow.maxWeeks}
        />
      </main>
    </div>
  );
}
