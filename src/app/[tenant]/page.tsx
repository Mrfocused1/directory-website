import type { Metadata } from "next";
import Link from "next/link";
import { getSiteData } from "@/lib/demo-data";
import Directory from "@/components/directory/Directory";
import { db } from "@/db";
import { sites, adSlots, stripeConnectAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function isAdvertisingAvailable(siteId: string): Promise<boolean> {
  if (!db) return false;
  const [site] = await db
    .select({ userId: sites.userId, isPublished: sites.isPublished })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site?.isPublished) return false;
  const [conn] = await db
    .select({ chargesEnabled: stripeConnectAccounts.chargesEnabled })
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.userId, site.userId))
    .limit(1);
  if (!conn?.chargesEnabled) return false;
  const slots = await db
    .select({ id: adSlots.id })
    .from(adSlots)
    .where(and(eq(adSlots.siteId, siteId), eq(adSlots.enabled, true)))
    .limit(1);
  return slots.length > 0;
}

// CDN-cache tenant pages for 5 minutes. Pipeline completion and site
// profile edits call revalidatePath("/" + slug) so changes show up
// immediately for real activity; this TTL only applies to passive
// traffic between edits. ~99% DB-read reduction for popular pages.
export const revalidate = 300;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  if (!data) return { title: "Not Found" };

  const description = data.site.bio || `Browse ${data.site.displayName}'s content directory`;
  const url = `${SITE_URL}/${tenant}`;

  return {
    // Just the display name — root layout's metadata.title.template
    // adds the " | BuildMy.Directory" suffix automatically. Returning
    // the suffix here too produced "X | BuildMy.Directory | BuildMy.Directory".
    title: data.site.displayName,
    description,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": `${url}/feed.xml` },
    },
    openGraph: {
      title: data.site.displayName,
      description,
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: data.site.displayName,
      description,
    },
  };
}

export default async function TenantDirectoryPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const data = await getSiteData(tenant);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold mb-2">404</h1>
          <p className="text-[color:var(--fg-muted)]">This directory doesn&apos;t exist yet.</p>
        </div>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: data.site.displayName,
    url: `${SITE_URL}/${tenant}`,
    description: data.site.bio || undefined,
    author: {
      "@type": "Person",
      name: data.site.displayName,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: data.posts.length,
      itemListElement: data.posts.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/${tenant}/p/${p.shortcode}`,
        name: p.title || p.shortcode,
      })),
    },
  };

  const adsAvailable = await isAdvertisingAvailable(data.siteId);

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Directory site={data.site} posts={data.posts} siteId={data.siteId} branding={data.branding} features={data.features} />
      {adsAvailable && (
        <div className="border-t border-[color:var(--border)] bg-[color:var(--bg)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-center">
            <Link
              href={`/${tenant}/advertise`}
              className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] underline underline-offset-4 transition"
            >
              Advertise on this directory &rarr;
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
