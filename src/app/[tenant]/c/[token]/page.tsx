import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/db";
import { collections, bookmarks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSiteData } from "@/lib/demo-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string; token: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  return {
    title: `Shared collection — ${data?.site.displayName || tenant}`,
    description: "A curated collection of posts.",
    robots: { index: false }, // Shared collections shouldn't be search-indexed
  };
}

export default async function SharedCollectionPage({
  params,
}: {
  params: Promise<{ tenant: string; token: string }>;
}) {
  const { tenant, token } = await params;

  if (!db) {
    return <NotFoundState tenant={tenant} />;
  }

  // Look up the collection by share token
  const collection = await db.query.collections.findFirst({
    where: eq(collections.shareToken, token),
  });
  if (!collection) {
    return <NotFoundState tenant={tenant} />;
  }

  // Load the site (must match tenant slug for clean URLs; tolerate UUID too)
  const data = await getSiteData(tenant);
  if (!data) {
    return <NotFoundState tenant={tenant} />;
  }

  // Get bookmark shortcodes in this collection
  const bms = await db.query.bookmarks.findMany({
    where: eq(bookmarks.collectionId, collection.id),
  });
  const shortcodes = new Set(bms.map((b) => b.postShortcode));

  // Match them to posts in the loaded site data
  const posts = data.posts.filter((p) => shortcodes.has(p.shortcode));

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-20 max-w-6xl">
          <nav className="mb-6">
            <Link
              href={`/${data.site.slug}`}
              className="text-sm font-medium text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition inline-flex items-center gap-1.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to {data.site.displayName}
            </Link>
          </nav>

          <header className="text-center mb-10 animate-fade-in">
            <div className="inline-flex items-center gap-1.5 mb-3 text-xs font-semibold text-[color:var(--fg-subtle)] uppercase tracking-wider">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
              </svg>
              Shared collection
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3">
              {collection.emoji && <span className="mr-2">{collection.emoji}</span>}
              {collection.name}
            </h1>
            <p className="text-sm text-[color:var(--fg-muted)]">
              {posts.length} post{posts.length === 1 ? "" : "s"} curated from{" "}
              <Link href={`/${data.site.slug}`} className="font-semibold text-[color:var(--fg)] hover:underline">
                {data.site.displayName}
              </Link>
            </p>
          </header>

          {posts.length === 0 ? (
            <div className="text-center py-20 bg-white border-2 border-dashed border-[color:var(--border)] rounded-2xl max-w-md mx-auto">
              <p className="text-sm text-[color:var(--fg-muted)]">
                This collection is empty.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {posts.map((p) => (
                <Link
                  key={p.shortcode}
                  href={`/${data.site.slug}/p/${p.shortcode}`}
                  className="block bg-[color:var(--card)] border border-[color:var(--border)] hover:bg-[color:var(--card-hover)] transition-all overflow-hidden rounded-xl shadow-sm"
                >
                  <div className="relative aspect-[4/5] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                    {p.thumbUrl ? (
                      <Image
                        src={p.thumbUrl}
                        alt={p.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 288px"
                        className="object-cover"
                      />
                    ) : null}
                    <span className="absolute bottom-2 left-2 text-[10px] font-semibold uppercase tracking-wide bg-white/90 text-black px-1.5 py-0.5 rounded">
                      {p.category}
                    </span>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold line-clamp-2 leading-snug text-[color:var(--fg)]">
                      {p.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function NotFoundState({ tenant }: { tenant: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-extrabold mb-2">Collection not found</h1>
        <p className="text-sm text-[color:var(--fg-muted)] mb-6">
          This shared collection may have been made private or deleted.
        </p>
        <Link
          href={`/${tenant}`}
          className="inline-flex h-11 px-6 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
        >
          Browse the directory
        </Link>
      </div>
    </div>
  );
}
