import type { Metadata } from "next";
import { getSiteData } from "@/lib/demo-data";
import Directory from "@/components/directory/Directory";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

/**
 * Lightweight embeddable view of a tenant directory.
 *
 * Designed to be dropped into an <iframe> on a creator's personal site.
 * Uses the same Directory component but omits the top site header to
 * keep the embed visually compact.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  return {
    title: data ? `${data.site.displayName} · embed` : "Embed",
    // Don't index the bare embed URL — the canonical directory owns SEO.
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const data = await getSiteData(tenant);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[color:var(--fg-muted)]">Directory not found.</p>
      </div>
    );
  }

  return (
    <>
      {/* Per-frame CSS: strip the body background so the embed blends
          with the host page. Consumers can style the iframe itself. */}
      <style>{`html, body { background: transparent !important; }`}</style>
      <div className="embed-root">
        <Directory
          site={data.site}
          posts={data.posts}
          siteId={data.siteId}
          branding={{
            ...data.branding,
            customBrandName: data.branding.customBrandName || data.site.displayName,
            customBrandUrl:
              data.branding.customBrandUrl || `${SITE_URL}/${tenant}`,
            showPoweredBy: true,
          }}
          features={data.features}
        />
      </div>
    </>
  );
}
