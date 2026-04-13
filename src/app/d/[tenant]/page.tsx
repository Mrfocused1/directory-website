import type { Metadata } from "next";
import { getSiteData } from "@/lib/demo-data";
import Directory from "@/components/directory/Directory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  if (!data) return { title: "Not Found" };

  return {
    title: `${data.site.displayName} | BuildMy.Directory`,
    description: data.site.bio || `Browse ${data.site.displayName}'s content directory`,
    openGraph: {
      title: data.site.displayName,
      description: data.site.bio || `Browse ${data.site.displayName}'s content directory`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: data.site.displayName,
      description: data.site.bio || `Browse ${data.site.displayName}'s content directory`,
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

  return <Directory site={data.site} posts={data.posts} />;
}
