import type { Metadata } from "next";
import { getSiteData } from "@/lib/demo-data";
import Directory from "@/components/directory/Directory";

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

  return {
    title: `${title} | ${data.site.displayName}`,
    description,
    openGraph: { title, description, type: "article" },
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

  return <Directory site={data.site} posts={data.posts} siteId={data.siteId} initialShortcode={shortcode} branding={data.branding} />;
}
