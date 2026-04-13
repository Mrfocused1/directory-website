/**
 * Reference Finder Module
 *
 * Finds related YouTube videos and articles for each post.
 * Previously used yt-dlp — for SaaS scale,
 * we use the YouTube Data API and news search APIs.
 */

import type { Reference } from "@/lib/types";

export type ReferenceSearchResult = {
  postId: string;
  references: Reference[];
};

/**
 * Find YouTube videos related to a post's content.
 */
export async function findYouTubeReferences(
  query: string,
  maxResults = 3,
): Promise<Reference[]> {
  // TODO: Implement with YouTube Data API v3
  //
  // const params = new URLSearchParams({
  //   part: 'snippet',
  //   q: query,
  //   type: 'video',
  //   maxResults: String(maxResults),
  //   relevanceLanguage: 'en',
  //   key: process.env.YOUTUBE_API_KEY!,
  // });
  // const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  // const data = await res.json();
  //
  // return data.items.map(item => ({
  //   kind: 'youtube' as const,
  //   title: item.snippet.title,
  //   videoId: item.id.videoId,
  //   note: item.snippet.channelTitle,
  // }));

  console.log(`[references] Would search YouTube for: ${query}`);
  return [];
}

/**
 * Find articles related to a post's content.
 */
export async function findArticleReferences(
  query: string,
  maxResults = 3,
): Promise<Reference[]> {
  // TODO: Implement with a news/search API
  //
  // Options:
  // - Tavily API (built for AI — good relevance)
  // - Perplexity API (good for finding authoritative sources)
  // - Google Custom Search API
  // - Bing Search API
  //
  // Example with Tavily:
  // const res = await fetch('https://api.tavily.com/search', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     api_key: process.env.TAVILY_API_KEY,
  //     query,
  //     max_results: maxResults,
  //     include_domains: ['bbc.com', 'reuters.com', 'bloomberg.com', 'ft.com'],
  //   }),
  // });

  console.log(`[references] Would search articles for: ${query}`);
  return [];
}

/**
 * Build a search query from a post's caption and transcript.
 */
export function buildSearchQuery(caption: string, transcript: string | null): string {
  // Use the first sentence or two from the caption
  const firstLine = caption.split("\n")[0] || caption;
  const query = firstLine.slice(0, 150).trim();

  // Remove hashtags and mentions
  return query
    .replace(/#\w+/g, "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find all references for a batch of posts.
 */
export async function findReferencesForPosts(
  posts: { postId: string; caption: string; transcript: string | null }[],
  onProgress?: (completed: number, total: number) => void,
): Promise<ReferenceSearchResult[]> {
  const results: ReferenceSearchResult[] = [];

  for (let i = 0; i < posts.length; i++) {
    const { postId, caption, transcript } = posts[i];
    const query = buildSearchQuery(caption, transcript);

    const [youtubeRefs, articleRefs] = await Promise.all([
      findYouTubeReferences(query),
      findArticleReferences(query),
    ]);

    results.push({
      postId,
      references: [...articleRefs, ...youtubeRefs],
    });

    onProgress?.(i + 1, posts.length);
  }

  return results;
}
