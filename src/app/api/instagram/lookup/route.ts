import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";

/**
 * GET /api/instagram/lookup?q=handle
 *
 * Searches for Instagram profiles matching the query.
 * Uses Instagram's public web profile data via the VPS scraper
 * or falls back to a direct public API lookup.
 *
 * Returns up to 5 matching profiles with name, username, avatar.
 */

interface ProfileResult {
  username: string;
  fullName: string;
  avatarUrl: string;
  isVerified: boolean;
  postCount: number;
}

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim().replace(/^@/, "");
  if (!q || q.length < 2) {
    return NextResponse.json({ profiles: [] });
  }

  // Sanitize: only allow valid Instagram handle chars
  if (!/^[a-zA-Z0-9_.]+$/.test(q)) {
    return NextResponse.json({ profiles: [] });
  }

  try {
    const profiles = await lookupProfiles(q);
    return NextResponse.json({ profiles });
  } catch (err) {
    console.error("[instagram/lookup] Failed:", err);
    return NextResponse.json({ profiles: [] });
  }
}

async function lookupProfiles(query: string): Promise<ProfileResult[]> {
  // Strategy 1: Try VPS scraper's /profile endpoint
  const vpsUrl = process.env.SCRAPER_VPS_URL;
  const vpsKey = process.env.SCRAPER_VPS_API_KEY;

  if (vpsUrl && vpsKey) {
    try {
      const res = await fetch(`${vpsUrl}/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": vpsKey,
        },
        body: JSON.stringify({ handle: query }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          return [{
            username: data.profile.username || query,
            fullName: data.profile.fullName || data.profile.full_name || "",
            avatarUrl: data.profile.avatarUrl || data.profile.profile_pic_url || "",
            isVerified: data.profile.isVerified || data.profile.is_verified || false,
            postCount: data.profile.postCount || data.profile.media_count || 0,
          }];
        }
      }
    } catch {
      // VPS unavailable — try fallback
    }
  }

  // Strategy 2: Use Instagram's public web API (no auth needed)
  // Fetch the profile page and extract JSON data
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "X-IG-App-ID": "936619743392459", // Instagram web app ID (public)
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const u = data?.data?.user;
      if (u) {
        return [{
          username: u.username || query,
          fullName: u.full_name || "",
          avatarUrl: u.profile_pic_url_hd || u.profile_pic_url || "",
          isVerified: u.is_verified || false,
          postCount: u.edge_owner_to_timeline_media?.count ?? 0,
        }];
      }
    }
  } catch {
    // Instagram API blocked or unavailable
  }

  // Strategy 3: Use Instagram web search API
  try {
    const res = await fetch(`https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(query)}&context=blended`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const users = data?.users || [];
      return users.slice(0, 5).map((item: Record<string, unknown>) => {
        const u = (item.user || item) as Record<string, unknown>;
        return {
          username: (u.username as string) || "",
          fullName: (u.full_name as string) || "",
          avatarUrl: (u.profile_pic_url as string) || "",
          isVerified: (u.is_verified as boolean) || false,
          postCount: 0,
        };
      });
    }
  } catch {
    // Search API also blocked
  }

  // All strategies failed — return the query as-is so the user can proceed
  return [{
    username: query,
    fullName: "",
    avatarUrl: "",
    isVerified: false,
    postCount: 0,
  }];
}
