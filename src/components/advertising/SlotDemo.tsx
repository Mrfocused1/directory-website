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

// ──────────────────────────────────────────────────────────────────────
// PRE-ROLL VIDEO / IMAGE demo
// ──────────────────────────────────────────────────────────────────────
function PreRollDemo({ site, samplePosts, isVideo }: Props & { isVideo: boolean }) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const on = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setShowing(true); setKey((k) => k + 1); }, 7000);
    return () => { clearTimeout(on); clearTimeout(restart); };
  }, [key]);

  return (
    <div className="relative w-[280px] h-[420px] mx-auto rounded-2xl overflow-hidden border border-black/10 shadow-xl bg-white">
      {/* post grid in background */}
      <div className="absolute inset-0 grid grid-cols-3 gap-0.5 opacity-40 pointer-events-none">
        {posts.slice(0, 6).map((p, i) => (
          <Thumb key={i} post={p} className="w-full h-full" />
        ))}
      </div>
      {/* modal backdrop */}
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
        <div className="w-48 h-64 bg-white rounded-xl overflow-hidden relative">
          <Thumb post={posts[0]} className="w-full h-40" />
          <div className="p-2">
            <p className="text-[10px] font-semibold truncate">{posts[0].title}</p>
            <p className="text-[9px] text-gray-400">{posts[0].category}</p>
          </div>
        </div>
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
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// BANNER TOP demo
// ──────────────────────────────────────────────────────────────────────
function BannerTopDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const delay = setTimeout(() => setShowing(true), 600);
    const hide = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setShowing(false); setKey((k) => k + 1); }, 6500);
    return () => { clearTimeout(delay); clearTimeout(hide); clearTimeout(restart); };
  }, [key]);

  return (
    <div className="w-full max-w-lg mx-auto rounded-2xl overflow-hidden border border-black/10 shadow-xl bg-white">
      {/* banner slot */}
      <AnimatePresence key={key}>
        {showing && (
          <motion.div
            className="relative flex items-center justify-between px-4 py-2.5 text-white text-sm font-semibold"
            style={{ background: site.accentColor }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 44, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <span className="text-xs">Sponsored by Sponsor · Learn more</span>
            <button className="text-white/70 hover:text-white text-base leading-none">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* directory header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-black/5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: site.accentColor }}
        >
          {(site.displayName ?? "S")[0].toUpperCase()}
        </div>
        <span className="font-bold text-sm">{site.displayName}</span>
      </div>

      {/* mini post grid */}
      <div className="grid grid-cols-3 gap-0.5 p-2">
        {posts.slice(0, 6).map((p, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Thumb post={p} className="w-full h-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// STICKY RIBBON demo
// ──────────────────────────────────────────────────────────────────────
function StickyRibbonDemo({ site, samplePosts }: Props) {
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
    <div className="relative w-full max-w-lg mx-auto rounded-2xl overflow-hidden border border-black/10 shadow-xl bg-white" style={{ height: 380 }}>
      {/* post grid */}
      <div className="p-3 grid grid-cols-3 gap-1.5">
        {posts.slice(0, 6).map((p, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Thumb post={p} className="w-full h-full" />
          </div>
        ))}
      </div>

      {/* sticky ribbon at bottom */}
      <AnimatePresence key={key}>
        {showing && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 text-white text-xs font-semibold shadow-lg"
            style={{ background: site.accentColor }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 35 }}
          >
            <span>Sponsor · Your trusted partner</span>
            <button className="opacity-70 hover:opacity-100">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-black/10 shadow-xl bg-white p-6">
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
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-black/10 shadow-xl bg-black overflow-hidden">
      <div className="relative aspect-video">
        <Thumb post={posts[0]} className="w-full h-full object-cover opacity-80" />
        <AnimatePresence>
          {phase === "ad" && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ background: site.accentColor + "ee" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="text-white text-[10px] font-bold uppercase tracking-widest bg-black/30 px-2 py-0.5 rounded">Sponsored</span>
              <p className="text-white font-bold">Sample Ad Creative</p>
              <p className="text-white/60 text-xs">Brought to you by Sponsor</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* timeline bar */}
      <div className="px-3 py-2 bg-black">
        <div className="relative h-1 bg-white/20 rounded-full">
          <motion.div
            className="absolute inset-y-0 left-0 bg-white rounded-full"
            animate={phase === "playing" ? { width: "30%" } : { width: "30%" }}
            transition={{ duration: 2.5, ease: "linear" }}
          />
          {/* sponsored marker */}
          <div className="absolute left-[30%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400 border border-black" />
        </div>
        <div className="flex justify-between text-white/40 text-[9px] mt-1">
          <span>0:00</span>
          <span className="text-yellow-400 text-[8px]">● SPONSORED</span>
          <span>10:00</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// POST-VIEW OVERLAY demo
// ──────────────────────────────────────────────────────────────────────
function PostViewOverlayDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);
  const [phase, setPhase] = useState<"post" | "ad">("post");
  const [key, setKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("ad"), 2000);
    const restart = setTimeout(() => { setPhase("post"); setKey((k) => k + 1); }, 6000);
    return () => { clearTimeout(t); clearTimeout(restart); };
  }, [key]);

  return (
    <div className="relative w-[280px] h-[420px] mx-auto rounded-2xl overflow-hidden border border-black/10 shadow-xl bg-gray-50">
      <div className="absolute inset-0 grid grid-cols-3 gap-0.5 opacity-30">
        {posts.slice(0, 6).map((p, i) => <Thumb key={i} post={p} className="w-full h-full" />)}
      </div>
      <AnimatePresence mode="wait">
        {phase === "post" ? (
          <motion.div
            key="post"
            className="absolute inset-0 bg-black/60 flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="w-48 h-64 bg-white rounded-xl overflow-hidden">
              <Thumb post={posts[0]} className="w-full h-40" />
              <div className="p-2"><p className="text-[10px] font-semibold">{posts[0].title}</p></div>
            </div>
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
    </div>
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
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-black/10 shadow-xl bg-white overflow-hidden">
      <div className="flex gap-1 px-3 pt-3 overflow-x-auto">
        {categories.map((cat, i) => (
          <div
            key={i}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${i === 1 ? "text-white" : "bg-black/5 text-gray-600"}`}
            style={i === 1 ? { background: site.accentColor } : {}}
          >
            {cat}
            {i === 1 && <span className="ml-1 text-[9px] opacity-70">· Sponsored</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-3">
        {posts.slice(0, 6).map((p, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Thumb post={p} className="w-full h-full" />
          </div>
        ))}
      </div>
      <div className="px-3 pb-2 text-center">
        <span className="text-[9px] text-gray-400">preview · coming_soon</span>
      </div>
    </div>
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
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-black/10 shadow-xl bg-white p-4 space-y-2">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">References</p>
      {refs.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-2.5 rounded-lg border border-black/5 hover:border-black/10 transition"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-black/5 flex items-center justify-center text-[8px] text-gray-400">{i + 1}</div>
            <div>
              <p className="text-xs font-medium">{r.title}</p>
              <p className="text-[10px] text-gray-400">{r.url}</p>
            </div>
          </div>
          {r.sponsored && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded text-white"
              style={{ background: site.accentColor }}
            >
              Sponsored
            </span>
          )}
        </div>
      ))}
      <p className="text-center text-[9px] text-gray-400 pt-1">preview · coming_soon</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR CARD demo
// ──────────────────────────────────────────────────────────────────────
function SidebarCardDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);

  return (
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-black/10 shadow-xl bg-white overflow-hidden flex">
      {/* main content */}
      <div className="flex-1 p-3 grid grid-cols-2 gap-1.5 content-start">
        {posts.slice(0, 4).map((p, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Thumb post={p} className="w-full h-full" />
          </div>
        ))}
      </div>
      {/* sidebar */}
      <div className="w-28 border-l border-black/5 p-2 flex flex-col gap-2">
        <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide">Sidebar</p>
        {/* sponsor card */}
        <div
          className="rounded-xl p-2 text-white flex flex-col gap-1"
          style={{ background: site.accentColor }}
        >
          <p className="text-[9px] opacity-70">Sponsored</p>
          <p className="text-[11px] font-bold leading-tight">Brand Name</p>
          <p className="text-[9px] opacity-70">Learn more →</p>
        </div>
        <p className="text-center text-[8px] text-gray-300 mt-auto">coming soon</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// HOMEPAGE TAKEOVER demo
// ──────────────────────────────────────────────────────────────────────
function HomepageTakeoverDemo({ site, samplePosts }: Props) {
  const posts = usePosts(samplePosts);
  const [showing, setShowing] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const hide = setTimeout(() => setShowing(false), 4000);
    const restart = setTimeout(() => { setShowing(true); setKey((k) => k + 1); }, 7000);
    return () => { clearTimeout(hide); clearTimeout(restart); };
  }, [key]);

  return (
    <div className="relative w-full max-w-lg mx-auto rounded-2xl border border-black/10 shadow-xl bg-white overflow-hidden" style={{ height: 380 }}>
      {/* site content */}
      <div className="p-3 grid grid-cols-3 gap-1.5">
        {posts.slice(0, 6).map((p, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Thumb post={p} className="w-full h-full" />
          </div>
        ))}
      </div>

      <AnimatePresence key={key}>
        {showing && (
          <>
            {/* wash */}
            <motion.div
              className="absolute inset-0"
              style={{ background: site.accentColor + "cc" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
            {/* welcome overlay */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 250, damping: 28 }}
            >
              <div className="bg-white rounded-2xl p-6 text-center shadow-2xl mx-6">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Welcome, sponsored by</p>
                <p className="font-extrabold text-lg mb-0.5">Sponsor Brand</p>
                <p className="text-xs text-gray-400">{site.displayName}</p>
                <button className="mt-3 text-[10px] text-gray-400 underline">Dismiss</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────────
export default function SlotDemo({ slotType, site, samplePosts }: Props) {
  const commonProps = { slotType, site, samplePosts };

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
