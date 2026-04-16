import type { Metadata } from "next";
import { getSiteData } from "@/lib/demo-data";
import Directory from "@/components/directory/Directory";

// Same 5-minute CDN cache as the tenant root page. Pipeline completion
// and post edits invalidate via revalidatePath in the relevant writer.
export const revalidate = 300;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string; shortcode: string }>;
}): Promise<Metadata> {
  const { tenant, shortcode } = await params;
  const data = await getSiteData(tenant);
  if (!data) return { title: "Not Found" };

  const post = data.posts.find((p) => p.shortcode === shortcode);
  const title = post ? post.title : data.site.displayName;
  const description = post
    ? post.caption.slice(0, 160)
    : data.site.bio || "Browse this content directory";
  const url = `${SITE_URL}/${tenant}/p/${shortcode}`;

  return {
    title: `${title} | ${data.site.displayName}`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "article", url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TenantPostPage({
  params,
}: {
  params: Promise<{ tenant: string; shortcode: string }>;
}) {
  const { tenant, shortcode } = await params;
  const data = await getSiteData(tenant);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold mb-2">404</h1>
          <p className="text-[color:var(--fg-muted)]">This directory doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  const post = data.posts.find((p) => p.shortcode === shortcode);
  const jsonLd = post
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title || data.site.displayName,
        description: (post.caption || "").slice(0, 300) || undefined,
        url: `${SITE_URL}/${tenant}/p/${shortcode}`,
        image: post.thumbUrl || undefined,
        datePublished: post.takenAt || undefined,
        author: {
          "@type": "Person",
          name: data.site.displayName,
        },
        articleSection: post.category || undefined,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Directory
        site={data.site}
        posts={data.posts}
        siteId={data.siteId}
        initialShortcode={shortcode}
        branding={data.branding}
        features={data.features}
      />
    </>
  );
}
