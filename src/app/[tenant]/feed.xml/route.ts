import { NextResponse } from "next/server";
import { getSiteData } from "@/lib/demo-data";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  // CDATA must not contain the sequence "]]>". Split it if found.
  return `<![CDATA[${s.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * GET /d/[tenant]/feed.xml
 *
 * RSS 2.0 feed of the most recent 50 posts in this directory.
 * Returned with cache headers so readers + CDNs can revalidate politely.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params;
  const data = await getSiteData(tenant);

  if (!data) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!data.posts || data.posts.length === 0) {
    const feedUrl = `${SITE_URL}/${tenant}/feed.xml`;
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
  <title>${escapeXml(data.site.displayName)} — Directory</title>
  <link>${SITE_URL}/${tenant}</link>
  <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
  <description>No posts yet.</description>
</channel></rss>`;
    return new NextResponse(emptyXml, {
      status: 200,
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  }

  const site = data.site;
  const baseUrl = `${SITE_URL}/${tenant}`;
  const feedUrl = `${baseUrl}/feed.xml`;
  const title = `${site.displayName} — Directory`;
  const description = site.bio || `Latest posts from ${site.displayName}`;
  const lastBuild = new Date().toUTCString();

  const items = data.posts.slice(0, 50).map((p) => {
    const postUrl = `${baseUrl}/p/${p.shortcode}`;
    const pubDate = p.takenAt ? new Date(p.takenAt).toUTCString() : lastBuild;
    const itemTitle = escapeXml(p.title || p.shortcode);
    const itemCategory = escapeXml(p.category || "Uncategorized");
    return `
    <item>
      <title>${itemTitle}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${itemCategory}</category>
      <description>${cdata(p.caption || "")}</description>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(description)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>BuildMy.Directory</generator>
    ${items.join("")}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
