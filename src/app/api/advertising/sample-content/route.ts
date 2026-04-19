import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const [site] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      displayName: sites.displayName,
      avatarUrl: sites.avatarUrl,
      accentColor: sites.accentColor,
      userId: sites.userId,
    })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1);

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const samplePosts = await db
    .select({
      thumbUrl: posts.thumbUrl,
      title: posts.title,
      category: posts.category,
    })
    .from(posts)
    .where(and(eq(posts.siteId, siteId), isNotNull(posts.thumbUrl)))
    .limit(6);

  return NextResponse.json({
    site: {
      slug: site.slug,
      displayName: site.displayName ?? site.slug,
      avatarUrl: site.avatarUrl ?? null,
      accentColor: site.accentColor ?? "#000000",
    },
    posts: samplePosts,
  });
}
