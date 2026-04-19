"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { SiteConfig, SitePost, Platform } from "@/lib/types";
import PostModal from "./PostModal";
import CountUp from "./CountUp";
import BackToTop from "./BackToTop";
import PlatformIcon from "./PlatformIcon";
import AnalyticsProvider from "./AnalyticsProvider";
import DirectoryBranding from "./DirectoryBranding";
import type { SiteBranding } from "@/lib/demo-data";
import SubscribeBanner from "@/components/subscribe/SubscribeBanner";
import FloatingSubscribe from "@/components/subscribe/FloatingSubscribe";
import BookmarkProvider from "@/components/bookmarks/BookmarkProvider";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import SignInModal from "@/components/bookmarks/SignInModal";
import CollectionsHeader from "@/components/bookmarks/CollectionsHeader";
import { trackPostClick, trackSearch, trackCategoryClick } from "@/lib/analytics/tracker";
import BannerTopAd from "@/components/advertising/BannerTopAd";
import StickyRibbonAd from "@/components/advertising/StickyRibbonAd";
import PromotedCategoryAd from "@/components/advertising/PromotedCategoryAd";
import SidebarCardAd from "@/components/advertising/SidebarCardAd";
import HomepageTakeoverAd from "@/components/advertising/HomepageTakeoverAd";

const PAGE_SIZE = 12;

type DirectoryFeatures = {
  newsletter?: boolean;
  bookmarks?: boolean;
  tts?: boolean;
};

type DirectoryProps = {
  site: SiteConfig;
  siteId?: string; // DB site ID for analytics
  posts: SitePost[];
  initialShortcode?: string;
  branding?: SiteBranding;
  features?: DirectoryFeatures;
};

export default function Directory({ site, siteId, posts, initialShortcode, branding, features }: DirectoryProps) {
  const analyticsId = siteId || site.slug;
  const allCategories = ["All", ...site.categories];

  type SortOption = "default" | "newest" | "oldest" | "title-az" | "title-za";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [selected, setSelected] = useState<SitePost | null>(
    initialShortcode ? posts.find((p) => p.shortcode === initialShortcode) ?? null : null,
  );
  const [page, setPage] = useState(1);
  const firstMount = useRef(true);
  const hasMultiplePlatforms = site.platforms && site.platforms.length > 1;

  // URL syncing for modal deep links
  const basePath = `/${site.slug}`;
  useEffect(() => {
    if (selected) {
      window.history.replaceState(null, "", `${basePath}/p/${selected.shortcode}`);
    } else {
      window.history.replaceState(null, "", basePath);
    }
  }, [selected, basePath]);

  const filtered = useMemo(() => {
    let list = posts;
    if (platformFilter !== "all") {
      list = list.filter((p) => p.platform === platformFilter);
    }
    if (category !== "All") {
      list = list.filter((p) => p.category === category);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.caption.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.transcript && p.transcript.toLowerCase().includes(q)),
      );
    }
    if (sortBy !== "default") {
      list = [...list].sort((a, b) => {
        switch (sortBy) {
          case "newest":
            return (b.takenAt ?? "").localeCompare(a.takenAt ?? "");
          case "oldest":
            return (a.takenAt ?? "").localeCompare(b.takenAt ?? "");
          case "title-az":
            return a.title.localeCompare(b.title);
          case "title-za":
            return b.title.localeCompare(a.title);
          default:
            return 0;
        }
      });
    }
    return list;
  }, [posts, search, category, platformFilter, sortBy]);

  // Category counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: posts.length };
    for (const cat of site.categories) c[cat] = 0;
    for (const p of posts) {
      if (p.category in c) c[p.category]++;
    }
    return c;
  }, [posts, site.categories]);

  // Track searches (debounced)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (search.trim().length >= 2) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        trackSearch(analyticsId, search.trim(), filtered.length);
      }, 800);
    }
    return () => clearTimeout(searchTimerRef.current);
  }, [search, filtered.length, analyticsId]);

  // Track category clicks
  const handleCategoryClick = useCallback((cat: string) => {
    setCategory(cat);
    if (cat !== "All") trackCategoryClick(analyticsId, cat);
  }, [analyticsId]);

  // Track post clicks
  const handlePostClick = useCallback((post: SitePost) => {
    setSelected(post);
    trackPostClick(analyticsId, post.shortcode);
  }, [analyticsId]);

  useEffect(() => {
    setPage(1);
  }, [search, category, platformFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const pageItems = filtered.slice(pageStart, pageEnd);

  const shouldStagger = firstMount.current && !search && category === "All";
  useEffect(() => {
    firstMount.current = false;
  }, []);

  // derive the current path for ad tracking — basePath is already computed above
  const adPath = basePath;

  return (
    <BookmarkProvider siteId={analyticsId}>
    <div className="min-h-screen relative">
      {/* Banner ad above everything, only when siteId is known */}
      {siteId && <BannerTopAd siteId={siteId} path={adPath} />}
      {/* Homepage takeover — full-screen welcome overlay, session-deduped inside component */}
      {siteId && <HomepageTakeoverAd siteId={siteId} path={adPath} siteName={site.displayName} />}
      <AnalyticsProvider siteId={analyticsId} />
      <SignInModal />
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-[var(--bg)]/70 via-[var(--bg)]/30 to-[var(--bg)]/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-20 max-w-7xl">
          {/* Hero */}
          <header className="text-center mb-8 animate-fade-in">
            {site.avatarUrl && (
              <div className="relative w-20 h-20 rounded-full overflow-hidden mx-auto mb-4 border-2 border-[color:var(--border)]">
                <Image src={site.avatarUrl} alt={site.displayName} fill className="object-cover" />
              </div>
            )}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-3">
              {site.displayName}
            </h1>
            {site.bio && (
              <p className="text-base sm:text-lg font-semibold text-[color:var(--fg-muted)] max-w-2xl mx-auto">
                {site.bio}
              </p>
            )}
            <CollectionsHeader tenantSlug={site.slug} />
            <p className="mt-2 text-xs text-[color:var(--fg-subtle)] tracking-wide">
              Browsing{" "}
              <span className="font-semibold text-[color:var(--fg)] tabular-nums">
                <CountUp value={filtered.length} />
              </span>{" "}
              {category === "All" ? "posts" : category.toLowerCase()}
              {search.trim() ? " matching your search" : ""}
            </p>
          </header>

          {/* Search */}
          <div className="max-w-2xl mx-auto mb-5 animate-fade-in">
            <label className="sr-only" htmlFor="search-input">Search posts</label>
            <div className="relative">
              <input
                id="search-input"
                type="text"
                inputMode="search"
                placeholder="Search posts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-12 px-5 pr-12 bg-[color:var(--card)] backdrop-blur-md border border-[color:var(--border)] rounded-full text-[color:var(--fg)] placeholder:text-[color:var(--fg-subtle)] shadow-sm focus:outline-none focus:border-[color:var(--fg)] focus:shadow-[0_0_0_3px_var(--ring)] transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--fg-muted)] pointer-events-none">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
            </div>
          </div>

          {/* Platform filter */}
          {hasMultiplePlatforms && (
            <div className="flex justify-center mb-3 animate-fade-in">
              <div className="flex items-center gap-1 bg-[color:var(--card)] border border-[color:var(--border)] backdrop-blur-md py-1 px-1 rounded-full shadow-sm">
                <button
                  type="button"
                  onClick={() => setPlatformFilter("all")}
                  className={`relative text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    platformFilter === "all" ? "bg-[color:var(--fg)]/10" : "text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
                  }`}
                >
                  All Platforms
                </button>
                {site.platforms.map((pc) => (
                  <button
                    key={pc.id}
                    type="button"
                    onClick={() => setPlatformFilter(pc.platform)}
                    className={`relative flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      platformFilter === pc.platform ? "bg-[color:var(--fg)]/10" : "text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
                    }`}
                  >
                    <PlatformIcon platform={pc.platform} size="xs" />
                    <span className="hidden sm:inline">{pc.platform === "instagram" ? "Instagram" : pc.platform === "tiktok" ? "TikTok" : "YouTube"}</span>
                    <span className="text-[10px] opacity-60 tabular-nums">({pc.postCount})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category pills */}
          {allCategories.length > 1 && (
            <nav aria-label="Filter by category" className="flex justify-center mb-8 animate-fade-in overflow-x-auto px-1">
              <div className="flex items-center gap-1 bg-[color:var(--card)] border border-[color:var(--border)] backdrop-blur-md py-1 px-1 rounded-full shadow-sm overflow-x-auto scrollbar-hide max-w-full">
                {siteId && <PromotedCategoryAd siteId={siteId} path={adPath} />}
                {allCategories.map((c) => {
                  const isActive = category === c;
                  const count = counts[c] ?? 0;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCategoryClick(c)}
                      aria-pressed={isActive}
                      className="relative cursor-pointer text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 min-h-[36px] rounded-full text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] whitespace-nowrap flex-shrink-0 transition-colors"
                    >
                      <span className="relative z-10">{c}</span>
                      <span className="relative z-10 ml-1 text-[10px] opacity-60 tabular-nums">({count})</span>
                      {isActive && (
                        <motion.div
                          layoutId="categoryLamp"
                          className="absolute inset-0 w-full bg-[color:var(--fg)]/10 rounded-full"
                          initial={false}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}

          {/* Main content + optional sidebar */}
          <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">

          {/* Grid — admin controls MOBILE column count (2 or 3) via the
              dashboard. Desktop always uses the natural responsive
              progression (3 at sm, 4 at lg) regardless of the toggle. */}
          {filtered.length > 0 ? (
            <>
              {/* Sort dropdown */}
              <div className="flex justify-end mb-4 px-1 sm:px-0 animate-fade-in">
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="appearance-none h-9 pl-3 pr-8 bg-[color:var(--card)] border border-[color:var(--border)] rounded-full text-xs font-semibold text-[color:var(--fg)] cursor-pointer focus:outline-none focus:border-[color:var(--fg)] transition"
                    aria-label="Sort posts"
                  >
                    <option value="default">Featured</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="title-az">Title A–Z</option>
                    <option value="title-za">Title Z–A</option>
                  </select>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[color:var(--fg-muted)]">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
              <div
                className={`grid gap-2 sm:gap-3 px-1 sm:px-0 animate-fade-in sm:grid-cols-3 lg:grid-cols-4 ${
                  site.gridColumns === 3 ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {pageItems.map((p, i) => (
                  <motion.div
                    key={p.shortcode}
                    className="relative bg-[color:var(--card)] border border-[color:var(--border)] hover:bg-[color:var(--card-hover)] transition-all overflow-hidden rounded-xl shadow-sm"
                    initial={shouldStagger ? { opacity: 0, y: 14, scale: 0.96 } : false}
                    animate={shouldStagger ? { opacity: 1, y: 0, scale: 1 } : undefined}
                    transition={shouldStagger ? { duration: 0.35, delay: Math.min(i * 0.03, 0.35) } : { duration: 0 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Main interactive area: opens post modal. BookmarkButton is a DOM sibling
                        below this button to avoid nested-interactive a11y violations. */}
                    <button
                      type="button"
                      onClick={() => handlePostClick(p)}
                      className="block w-full text-left cursor-pointer"
                      aria-label={`Open ${p.title}`}
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
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                              {p.type === "video" ? (
                                <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
                              ) : (
                                <>
                                  <rect x="3" y="3" width="18" height="18" rx="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <path d="M21 15l-5-5L5 21" />
                                </>
                              )}
                            </svg>
                          </div>
                        </div>
                      )}
                      {p.type === "video" && p.thumbUrl && (
                        <span className="absolute top-2 right-2 text-white drop-shadow" aria-label="Video">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      )}
                      {p.type === "carousel" && p.thumbUrl && (
                        <span className="absolute top-2 right-2 text-white drop-shadow" aria-label="Carousel">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <rect x="7" y="7" width="13" height="13" rx="2" />
                            <path d="M4 16V5a1 1 0 0 1 1-1h11" />
                          </svg>
                        </span>
                      )}
                      {p.isFeatured && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                          </svg>
                          Pinned
                        </span>
                      )}
                      <div className="absolute bottom-2 left-2 flex items-center gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/90 text-black px-1.5 py-0.5 rounded">
                          {p.category}
                        </span>
                        {hasMultiplePlatforms && (
                          <span className="w-5 h-5 flex items-center justify-center bg-white/90 rounded">
                            <PlatformIcon platform={p.platform} size="xs" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold line-clamp-2 leading-snug text-[color:var(--fg)]">
                        {p.title}
                      </p>
                      {p.references.length > 0 && (
                        <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1 tabular-nums">
                          {p.references.length} reference{p.references.length === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                    </button>
                    {/* BookmarkButton is a DOM sibling of the main button to avoid nested-interactive */}
                    <div className="absolute top-2 left-2 z-10">
                      <BookmarkButton shortcode={p.shortcode} size="sm" />
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Pagination */}
              <div className="mt-10 flex flex-col items-center gap-3 animate-fade-in">
                <p className="text-xs text-[color:var(--fg-subtle)] font-medium tabular-nums">
                  Showing <span className="text-[color:var(--fg)] font-semibold">{pageStart + 1}</span>
                  {"\u2013"}
                  <span className="text-[color:var(--fg)] font-semibold">{pageEnd}</span> of{" "}
                  <span className="text-[color:var(--fg)] font-semibold">{filtered.length}</span>
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      disabled={currentPage === 1}
                      className="h-10 px-4 rounded-full text-sm font-semibold bg-[color:var(--card)] border border-[color:var(--border)] text-[color:var(--fg)] hover:bg-[color:var(--fg)] hover:text-[color:var(--bg)] disabled:opacity-40 disabled:hover:bg-[color:var(--card)] disabled:hover:text-[color:var(--fg)] transition"
                      aria-label="Previous page"
                    >
                      Prev
                    </button>
                    {pageNumbers(currentPage, totalPages).map((item, idx) =>
                      item === "\u2026" ? (
                        <span key={`gap-${idx}`} className="w-10 text-center text-[color:var(--fg-subtle)] select-none">
                          {"\u2026"}
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => { setPage(item as number); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          aria-current={currentPage === item ? "page" : undefined}
                          className={`w-10 h-10 rounded-full text-sm font-semibold border transition ${
                            currentPage === item
                              ? "bg-[color:var(--fg)] text-[color:var(--bg)] border-[color:var(--fg)]"
                              : "bg-[color:var(--card)] text-[color:var(--fg)] border-[color:var(--border)] hover:bg-[color:var(--fg)]/5"
                          }`}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      disabled={currentPage === totalPages}
                      className="h-10 px-4 rounded-full text-sm font-semibold bg-[color:var(--card)] border border-[color:var(--border)] text-[color:var(--fg)] hover:bg-[color:var(--fg)] hover:text-[color:var(--bg)] disabled:opacity-40 disabled:hover:bg-[color:var(--card)] disabled:hover:text-[color:var(--fg)] transition"
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20 animate-fade-in">
              <h3 className="text-2xl font-semibold mb-2">No posts found</h3>
              <p className="text-[color:var(--fg-muted)]">Try adjusting your search or category filter</p>
            </div>
          )}

          {/* Subscribe banner — only when owner's plan includes newsletter */}
          {features?.newsletter !== false && (
            <div className="mt-14 max-w-2xl mx-auto animate-fade-in">
              <SubscribeBanner
                siteId={analyticsId}
                siteName={site.displayName}
                categories={site.categories}
              />
            </div>
          )}

          </div>{/* end flex-1 */}
          {siteId && <SidebarCardAd siteId={siteId} path={adPath} />}
          </div>{/* end sidebar flex */}

          {/* Powered-by footer (respects remove_branding / white_label) */}
          {branding && <DirectoryBranding branding={branding} />}
        </main>
      </div>

      <PostModal post={selected} onClose={() => setSelected(null)} siteId={analyticsId} ttsEnabled={features?.tts !== false} />
      <BackToTop />
      {features?.newsletter !== false && <FloatingSubscribe siteId={analyticsId} />}
      {/* Sticky ribbon ad fixed at bottom of viewport */}
      {siteId && <StickyRibbonAd siteId={siteId} path={adPath} />}
    </div>
    </BookmarkProvider>
  );
}

function pageNumbers(current: number, total: number): (number | "\u2026")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "\u2026")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("\u2026");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("\u2026");
  items.push(total);
  return items;
}
