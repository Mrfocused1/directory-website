"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export type DemoSite = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string;
};

export type DemoPost = {
  thumbUrl: string | null;
  title: string;
  category: string;
};

type Props = {
  slotType: string;
  site: DemoSite;
  samplePosts: DemoPost[];
  /**
   * When set, the demos that show a directory backdrop iframe
   * /{slug}/preview (the real page, sans ads + analytics) instead of
   * rendering a stylised mock grid. Advertisers then see the ad
   * animating over the creator's actual directory.
   */
  realBackdropSlug?: string;
};

const FALLBACK_POSTS: DemoPost[] = [
  { thumbUrl: null, title: "How to start investing", category: "Finance" },
  { thumbUrl: null, title: "Morning routine tips", category: "Health" },
  { thumbUrl: null, title: "Best productivity apps", category: "Tech" },
  { thumbUrl: null, title: "Travel on a budget", category: "Travel" },
  { thumbUrl: null, title: "Home workout guide", category: "Fitness" },
  { thumbUrl: null, title: "Healthy meal prep", category: "Food" },
];

function usePosts(samplePosts: DemoPost[]) {
  return samplePosts.length > 0 ? samplePosts : FALLBACK_POSTS;
}

// Iframe backdrop of the real tenant directory, used when we want the
// ad to appear over the creator's actual page instead of a stylised mock.
// pointer-events-none keeps clicks from landing inside the preview; the
// sandbox lets scripts run (the page is a client component with state)
// but strips form submission and top-level navigation.
function RealBackdrop({ slug }: { slug: string }) {
  return (
    <iframe
      src={`/${slug}/preview`}
      className="absolute inset-0 w-full h-full border-0 pointer-events-none"
      title="Directory preview"
      sandbox="allow-scripts allow-same-origin"
      loading="lazy"
    />
  );
}

// Phone-shaped vertical frame used by every demo. The directory is a
// mobile-first product — landscape previews misrepresent how the ad
// actually lands. Width + height set inline because Tailwind's
// arbitrary `aspect-[9/16]` utility silently dropped through in
// production (same issue that killed the hero gradient).
function PhoneFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "relative mx-auto rounded-[28px] overflow-hidden border border-black/10 shadow-xl bg-white " +
        className
      }
      style={{ width: 280, height: Math.round(280 * 16 / 9) }}
    >
      {children}
    </div>
  );
}

// Thumb: gradient tile if no real image
function Thumb({ post, className }: { post: DemoPost; className?: string }) {
  const colors = ["#e0e7ff", "#fce7f3", "#d1fae5", "#fef3c7", "#ede9fe", "#fee2e2"];
  const idx = Math.abs([...post.title].reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length;
  if (post.thumbUrl) {
    return (
      <img
        src={post.thumbUrl}
        alt={post.title}
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  }
  return <div className={className} style={{ background: colors[idx] }} />;
}

// Realistic-looking mock post card used inside the demos that show the
// advertiser what a viewer was looking at when the ad fires. Populates
// category, title, caption excerpt, and a few reference rows so the
// preview doesn't feel empty next to the ad overlay.
const DEMO_CAPTION =
  "Breaking down how the numbers stacked up on this deal — purchase price, refurb budget, end value, and the lender's rate.";
const DEMO_REFS = [
  { n: 1, title: "GOV.UK — Stamp Duty calculator", host: "gov.uk" },
  { n: 2, title: "RICS — Residential valuations", host: "rics.org" },
  { n: 3, title: "Bank of England base rate", host: "bankofengland.co.uk" },
];

function MockPostCard({
  site,
  post,
  compact,
}: {
  site: DemoSite;
  post: DemoPost;
  compact?: boolean;
}) {
  // No fixed height — let the card size itself to the content so
  // the caption and References sit snugly together instead of
  // leaving an empty middle band. Compact trims only the thumb and
  // the overall width so it fits inside the phone frame.
  const w = compact ? "w-52" : "w-56";
  const thumbH = compact ? "h-24" : "h-32";
  return (
    <div className={`${w} bg-white rounded-xl overflow-hidden border border-black/5 shadow-sm`}>
      <div className="relative">
        <Thumb post={post} className={`w-full ${thumbH}`} />
        {post.category && (
          <span className="absolute top-2 left-2 text-[9px] font-semibold uppercase tracking-wide bg-black/70 text-white px-1.5 py-0.5 rounded">
            {post.category}
          </span>
        )}
      </div>
      <div className="px-2.5 pt-2 pb-2">
        <p className="text-[11px] font-bold text-gray-900 leading-snug line-clamp-2">
          {post.title || "Untitled"}
        </p>
        <p className="text-[9px] text-gray-500 leading-snug mt-1 line-clamp-2">
          {DEMO_CAPTION}
        </p>
        <div className="mt-2 pt-1.5 border-t border-black/5">
          <p className="text-[8px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
            References
          </p>
          <div className="space-y-0.5">
            {DEMO_REFS.map((r) => (
              <div key={r.n} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="shrink-0 w-3 h-3 rounded text-[7px] font-bold text-white flex items-center justify-center"
                  style={{ background: site.accentColor }}
                >
                  {r.n}
                </span>
                <span className="text-[8px] text-gray-700 font-medium truncate">{r.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PRE-ROLL VIDEO / IMAGE demo
// ──────────────────────────────────────────────────────────────────────
function PreRollDemo({ site, samplePosts, isVideo, realBackdropSlug }: Props & { isVideo: boolean }) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const on = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setShowing(true); setKey((k) => k + 1); }, 7000);
    return () => { clearTimeout(on); clearTimeout(restart); };
  }, [key]);

  return (
    <PhoneFrame>
      {/* backdrop: real page iframe OR stylised grid */}
      {realBackdropSlug ? (
        <RealBackdrop slug={realBackdropSlug} />
      ) : (
        <div className="absolute inset-0 grid grid-cols-3 gap-0.5 opacity-40 pointer-events-none">
          {posts.slice(0, 6).map((p, i) => (
            <Thumb key={i} post={p} className="w-full h-full" />
          ))}
        </div>
      )}
      {/* modal backdrop — preview of a post the user was opening when the ad fired */}
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
        <MockPostCard site={site} post={posts[0]} compact />
      </div>

      <AnimatePresence key={key}>
        {showing && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-20"
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          >
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{ background: site.accentColor + "ee" }}
            >
              {isVideo && (
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              <p className="text-white font-bold text-lg">Sample Ad</p>
              <p className="text-white/70 text-xs">Brought to you by Sponsor</p>
              <div className="mt-2 px-4 py-1.5 bg-white/20 rounded-full text-white text-xs">
                {isVideo ? "Skip in 5s" : "Tap to dismiss"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-2 left-0 right-0 flex justify-center">
        <span className="text-[9px] text-white/60 bg-black/30 px-2 py-0.5 rounded-full">
          {isVideo ? "pre_roll_video demo" : "pre_roll_image demo"}
        </span>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// BANNER TOP demo
// ──────────────────────────────────────────────────────────────────────
function BannerTopDemo({ site, samplePosts, realBackdropSlug }: Props) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const delay = setTimeout(() => setShowing(true), 600);
    const hide = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setShowing(false); setKey((k) => k + 1); }, 6500);
    return () => { clearTimeout(delay); clearTimeout(hide); clearTimeout(restart); };
  }, [key]);

  // When iframing the real page we overlay the banner animation on top
  // instead of stacking it above the mock directory layout.
  if (realBackdropSlug) {
    return (
      <PhoneFrame>
        <RealBackdrop slug={realBackdropSlug} />
        <AnimatePresence key={key}>
          {showing && (
            <motion.div
              className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 text-white text-xs font-semibold z-10"
              style={{ background: site.accentColor }}
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <span className="text-[11px]">Sponsored by Sponsor · Learn more</span>
              <button className="text-white/70 hover:text-white text-base leading-none">×</button>
            </motion.div>
          )}
        </AnimatePresence>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col">
        {/* banner slot */}
        <AnimatePresence key={key}>
          {showing && (
            <motion.div
              className="flex items-center justify-between px-3 py-2 text-white text-xs font-semibold shrink-0"
              style={{ background: site.accentColor }}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 36, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <span className="text-[11px] truncate">Sponsored by Sponsor</span>
              <button className="text-white/70 hover:text-white text-base leading-none">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* directory header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: site.accentColor }}
          >
            {(site.displayName ?? "S")[0].toUpperCase()}
          </div>
          <span className="font-bold text-sm truncate">{site.displayName}</span>
        </div>

        {/* mini post grid — vertical scroll on a phone */}
        <div className="flex-1 overflow-hidden p-2">
          <div className="grid grid-cols-2 gap-1.5">
            {posts.slice(0, 8).map((p, i) => (
              <div key={i} className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
                <Thumb post={p} className="w-full h-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// STICKY RIBBON demo
// ──────────────────────────────────────────────────────────────────────
function StickyRibbonDemo({ site, samplePosts, realBackdropSlug }: Props) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const delay = setTimeout(() => setShowing(true), 800);
    const hide = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setKey((k) => k + 1); }, 6000);
    return () => { clearTimeout(delay); clearTimeout(hide); clearTimeout(restart); };
  }, [key]);

  return (
    <PhoneFrame>
      {realBackdropSlug ? (
        <RealBackdrop slug={realBackdropSlug} />
      ) : (
        <div className="p-2 grid grid-cols-2 gap-1.5">
          {posts.slice(0, 8).map((p, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
              <Thumb post={p} className="w-full h-full" />
            </div>
          ))}
        </div>
      )}

      {/* sticky ribbon at bottom */}
      <AnimatePresence key={key}>
        {showing && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2.5 text-white text-xs font-semibold shadow-lg"
            style={{ background: site.accentColor }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 35 }}
          >
            <span className="text-[11px] truncate">Sponsor · Your trusted partner</span>
            <button className="opacity-70 hover:opacity-100 shrink-0">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PRE-ROLL AUDIO demo (mock, no real audio)
// ──────────────────────────────────────────────────────────────────────
function PreRollAudioDemo({ site }: Props) {
  const [phase, setPhase] = useState<"sponsor" | "playing">("sponsor");
  const [seconds, setSeconds] = useState(14);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (phase === "sponsor" && seconds > 0) {
      const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
      return () => clearTimeout(t);
    }
    if (phase === "sponsor" && seconds === 0) {
      setPhase("playing");
      const restart = setTimeout(() => { setPhase("sponsor"); setSeconds(14); setKey((k) => k + 1); }, 3000);
      return () => clearTimeout(restart);
    }
  }, [phase, seconds, key]);

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {phase === "sponsor" ? (
            <motion.div
              key="sponsor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-4"
            >
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sponsor message</p>
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold"
                style={{ background: site.accentColor }}
              >
                S
              </div>
              <p className="text-sm font-semibold">This episode is brought to you by Sponsor</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-xs font-semibold" style={{ background: site.accentColor }}>
                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                {seconds}s remaining
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-4"
            >
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Now playing</p>
              <div className="flex items-center justify-center gap-1 h-16">
                {[3, 7, 5, 9, 4, 8, 3, 6, 7, 4, 9, 5].map((h, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full"
                    style={{ background: site.accentColor }}
                    animate={{ height: [h * 4, h * 6, h * 3, h * 5] }}
                    transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 }}
                  />
                ))}
              </div>
              <div className="px-4 py-2 rounded-full border border-black/10 text-xs font-medium inline-block">
                Listen in Spanish
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MID-ROLL VIDEO demo
// ──────────────────────────────────────────────────────────────────────
function MidRollVideoDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);
  const [phase, setPhase] = useState<"playing" | "ad">("playing");
  const [key, setKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("ad"), 2500);
    const restart = setTimeout(() => { setPhase("playing"); setKey((k) => k + 1); }, 6000);
    return () => { clearTimeout(t); clearTimeout(restart); };
  }, [key]);

  return (
    <PhoneFrame className="!bg-black">
      {/* fullscreen vertical video surface */}
      <div className="absolute inset-0">
        <Thumb post={posts[0]} className="w-full h-full object-cover opacity-80" />
        <AnimatePresence>
          {phase === "ad" && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4"
              style={{ background: site.accentColor + "ee" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="text-white text-[10px] font-bold uppercase tracking-widest bg-black/30 px-2 py-0.5 rounded">Sponsored</span>
              <p className="text-white font-bold text-center">Sample Ad Creative</p>
              <p className="text-white/60 text-xs text-center">Brought to you by Sponsor</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* timeline bar pinned to bottom, mobile-video style */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-3 bg-gradient-to-t from-black/80 to-transparent">
        <div className="relative h-1 bg-white/20 rounded-full">
          <div className="absolute inset-y-0 left-0 bg-white rounded-full" style={{ width: "30%" }} />
          <div className="absolute left-[30%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400 border border-black" />
        </div>
        <div className="flex justify-between text-white/60 text-[9px] mt-1">
          <span>0:00</span>
          <span className="text-yellow-400 text-[8px]">● SPONSORED</span>
          <span>10:00</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// POST-VIEW OVERLAY demo
// ──────────────────────────────────────────────────────────────────────
function PostViewOverlayDemo({ site, samplePosts, realBackdropSlug }: Props) {
  const posts = usePosts(samplePosts);
  const [phase, setPhase] = useState<"post" | "ad">("post");
  const [key, setKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("ad"), 2000);
    const restart = setTimeout(() => { setPhase("post"); setKey((k) => k + 1); }, 6000);
    return () => { clearTimeout(t); clearTimeout(restart); };
  }, [key]);

  return (
    <PhoneFrame className="!bg-gray-50">
      {realBackdropSlug ? (
        <RealBackdrop slug={realBackdropSlug} />
      ) : (
        <div className="absolute inset-0 grid grid-cols-3 gap-0.5 opacity-30">
          {posts.slice(0, 6).map((p, i) => <Thumb key={i} post={p} className="w-full h-full" />)}
        </div>
      )}
      <AnimatePresence mode="wait">
        {phase === "post" ? (
          <motion.div
            key="post"
            className="absolute inset-0 bg-black/60 flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <MockPostCard site={site} post={posts[0]} compact />
          </motion.div>
        ) : (
          <motion.div
            key="ad"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: site.accentColor + "f0" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button className="absolute top-3 right-3 text-white/70 text-lg">×</button>
            <p className="text-white/70 text-[10px] uppercase tracking-widest">Sponsor moment</p>
            <p className="text-white font-bold text-lg">Sample Ad</p>
            <p className="text-white/60 text-xs">Brought to you by Sponsor</p>
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PROMOTED CATEGORY demo
// ──────────────────────────────────────────────────────────────────────
function PromotedCategoryDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);
  const categories = [...new Set(posts.map((p) => p.category))].slice(0, 4);
  if (categories.length < 4) categories.push("More");

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col">
        <div className="flex gap-1 px-2 pt-2 overflow-x-auto shrink-0">
          {categories.map((cat, i) => (
            <div
              key={i}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium ${i === 1 ? "text-white" : "bg-black/5 text-gray-600"}`}
              style={i === 1 ? { background: site.accentColor } : {}}
            >
              {cat}
              {i === 1 && <span className="ml-1 text-[8px] opacity-70">· Sponsored</span>}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-hidden grid grid-cols-2 gap-1.5 p-2">
          {posts.slice(0, 8).map((p, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
              <Thumb post={p} className="w-full h-full" />
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SPONSORED REFERENCE demo
// ──────────────────────────────────────────────────────────────────────
function SponsoredReferenceDemo({ site }: Props) {
  const refs = [
    { title: "Original source article", url: "example.com" },
    { title: "Related study — Nature 2024", url: "nature.com" },
    { title: "Sponsor brand resource", url: "sponsor.com", sponsored: true },
    { title: "Wikipedia overview", url: "wikipedia.org" },
  ];

  return (
    <PhoneFrame>
      <div className="absolute inset-0 p-3 overflow-y-auto">
        <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">References</p>
        <div className="space-y-1.5">
          {refs.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg border border-black/5 hover:border-black/10 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-4 h-4 shrink-0 rounded bg-black/5 flex items-center justify-center text-[8px] text-gray-400">{i + 1}</div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium truncate">{r.title}</p>
                  <p className="text-[9px] text-gray-400 truncate">{r.url}</p>
                </div>
              </div>
              {r.sponsored && (
                <span
                  className="shrink-0 ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded text-white"
                  style={{ background: site.accentColor }}
                >
                  Sponsored
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR CARD demo
// ──────────────────────────────────────────────────────────────────────
function SidebarCardDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col">
        {/* main post grid */}
        <div className="flex-1 overflow-hidden p-2 grid grid-cols-2 gap-1.5 content-start">
          {posts.slice(0, 6).map((p, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
              <Thumb post={p} className="w-full h-full" />
            </div>
          ))}
        </div>
        {/* mobile sidebar card sits above the bottom of the feed */}
        <div className="shrink-0 border-t border-black/5 p-2">
          <div
            className="rounded-xl px-3 py-2 text-white flex items-center gap-3"
            style={{ background: site.accentColor }}
          >
            <div className="w-8 h-8 rounded-lg bg-white/20 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] opacity-70 uppercase tracking-wide">Sponsored</p>
              <p className="text-[11px] font-bold leading-tight">Brand Name</p>
            </div>
            <span className="text-[10px] opacity-80 shrink-0">Learn more →</span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// HOMEPAGE TAKEOVER demo
// ──────────────────────────────────────────────────────────────────────
function HomepageTakeoverDemo({ site, samplePosts, realBackdropSlug }: Props) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const hide = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setShowing(true); setKey((k) => k + 1); }, 7000);
    return () => { clearTimeout(hide); clearTimeout(restart); };
  }, [key]);

  return (
    <PhoneFrame>
      {realBackdropSlug ? (
        <RealBackdrop slug={realBackdropSlug} />
      ) : (
        <div className="p-2 grid grid-cols-2 gap-1.5">
          {posts.slice(0, 8).map((p, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
              <Thumb post={p} className="w-full h-full" />
            </div>
          ))}
        </div>
      )}

      <AnimatePresence key={key}>
        {showing && (
          <>
            <motion.div
              className="absolute inset-0"
              style={{ background: site.accentColor + "cc" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 250, damping: 28 }}
            >
              <div className="bg-white rounded-2xl p-5 text-center shadow-2xl mx-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Welcome, sponsored by</p>
                <p className="font-extrabold text-lg mb-0.5">Sponsor Brand</p>
                <p className="text-xs text-gray-400">{site.displayName}</p>
                <button className="mt-3 text-[10px] text-gray-400 underline">Dismiss</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PhoneFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────────
export default function SlotDemo({ slotType, site, samplePosts, realBackdropSlug }: Props) {
  const commonProps = { slotType, site, samplePosts, realBackdropSlug };

  switch (slotType) {
    case "pre_roll_video":
      return <PreRollDemo {...commonProps} isVideo={true} />;
    case "pre_roll_image":
      return <PreRollDemo {...commonProps} isVideo={false} />;
    case "pre_roll_audio":
      return <PreRollAudioDemo {...commonProps} />;
    case "mid_roll_video":
      return <MidRollVideoDemo {...commonProps} />;
    case "post_view_overlay":
      return <PostViewOverlayDemo {...commonProps} />;
    case "promoted_category":
      return <PromotedCategoryDemo {...commonProps} />;
    case "sponsored_reference":
      return <SponsoredReferenceDemo {...commonProps} />;
    case "banner_top":
      return <BannerTopDemo {...commonProps} />;
    case "sticky_ribbon":
      return <StickyRibbonDemo {...commonProps} />;
    case "sidebar_card":
      return <SidebarCardDemo {...commonProps} />;
    case "homepage_takeover":
      return <HomepageTakeoverDemo {...commonProps} />;
    default:
      return (
        <div className="flex items-center justify-center h-48 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <p className="text-sm text-gray-400">No preview available</p>
        </div>
      );
  }
}
