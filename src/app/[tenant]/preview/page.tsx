import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/demo-data";
import Directory from "@/components/directory/Directory";

/**
 * /{tenant}/preview
 *
 * Ad-free, analytics-free snapshot of the tenant directory, served to
 * iframes on the advertiser-facing slot pages so the animated SlotDemo
 * can overlay a real ad on top of the creator's actual layout.
 *
 * Indexed by search engines would be wasteful and risks duplicate-content
 * penalties — we explicitly noindex.
 */
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

export const revalidate = 300;

type Props = { params: Promise<{ tenant: string }> };

export default async function TenantPreviewPage({ params }: Props) {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  if (!data) notFound();

  return (
    <Directory
      site={data.site}
      posts={data.posts}
      siteId={data.siteId}
      branding={data.branding}
      features={data.features}
      preview
    />
  );
}
