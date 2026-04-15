import { redirect } from "next/navigation";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import BuildProgressClient from "./BuildProgressClient";

/**
 * /dashboard/build/[siteId]
 *
 * Live progress screen for an in-flight or failed build. Used when a
 * user clicks "Retry build" on a draft site card from the dashboard —
 * instead of an opaque alert() they land here and watch the pipeline
 * live, with a retry path if it fails.
 */
export default async function BuildProgressPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;

  const user = await getApiUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/build/${siteId}`)}`);

  if (!db) redirect("/dashboard");

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: {
      id: true,
      slug: true,
      handle: true,
      platform: true,
      displayName: true,
      isPublished: true,
    },
  });
  if (!site) redirect("/dashboard");

  return (
    <BuildProgressClient
      siteId={site.id}
      slug={site.slug}
      handle={site.handle}
      platform={site.platform as "instagram" | "tiktok"}
      displayName={site.displayName || site.slug}
      alreadyPublished={site.isPublished}
    />
  );
}
