"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

const HANDLE = "@garyvee";

/**
 * Six-tile grid of looping talking-head videos.
 *
 * To swap Gary Vee in for the placeholders:
 *   1. Obtain MP4 URLs you have rights to (his YouTube via yt-dlp
 *      + your own CDN, Apify scrape + Vercel Blob, or licensed stock).
 *   2. Replace each `src` below. Any falsy `src` falls back to the
 *      colored tile + text label automatically.
 *
 * The placeholders below are Google's public sample videos — reliable
 * URLs that prove the grid works. They are NOT Gary Vee; swap when
 * ready. All videos autoplay muted looped — browsers allow this
 * without user interaction.
 */
const VIDEOS: { src: string; bg: string; label: string; darkText?: boolean }[] = [
  {
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    bg: "var(--bd-maroon)",
    label: "Wine tasting",
  },
  {
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    bg: "var(--bd-lilac)",
    label: "Marketing tip",
    darkText: true,
  },
  {
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    bg: "var(--bd-lime)",
    label: "NYC speech",
    darkText: true,
  },
  {
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    bg: "var(--bd-green)",
    label: "Patience > hustle",
  },
  {
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    bg: "var(--bd-purple)",
    label: "Trash talk",
  },
  {
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
    bg: "var(--bd-cream-2)",
    label: "Q&A reel",
    darkText: true,
  },
];

/**
 * AutoScrape demo: types @garyvee, then fills a 3×2 grid of looping
 * video tiles one-by-one. Once full, holds for ~5s then resets so the
 * fill sequence plays again.
 */
export default function AutoScrapeDemo() {
  const [typed, setTyped] = useState(0);
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t <= 800) {
        setTyped(Math.min(HANDLE.length, Math.floor(t / 100)));
      } else if (t > 800 && t <= 1400) {
        setTyped(HANDLE.length);
        setFilled(0);
      } else if (t > 1400 && t <= 4400) {
        setFilled(Math.min(VIDEOS.length, Math.floor((t - 1400) / 500) + 1));
      } else if (t > 4400 && t <= 10000) {
        setFilled(VIDEOS.length);
      } else {
        t = 0; setTyped(0); setFilled(0);
      }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <DemoFrame accent="#d3fd74">
      <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3 shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--bd-grey)] shrink-0">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
        <span className="text-xs font-semibold text-[color:var(--bd-grey)] mr-1">Instagram</span>
        <span className="text-sm font-medium text-[color:var(--bd-dark)] tracking-tight">
          {HANDLE.slice(0, typed)}
          {typed < HANDLE.length && <span className="bd-caret">|</span>}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)] bd-pulse-dot" />
        {filled === 0
          ? "Connecting…"
          : filled < VIDEOS.length
          ? `Pulling posts… ${filled}/${VIDEOS.length}`
          : `${VIDEOS.length} posts found`}
      </div>

      <div className="flex-1 grid grid-cols-3 gap-2">
        {VIDEOS.map((v, i) => {
          const visible = i < filled;
          return (
            <VideoTile
              key={i}
              video={v}
              visible={visible}
              delay={i * 50}
            />
          );
        })}
      </div>
    </DemoFrame>
  );
}

function VideoTile({
  video,
  visible,
  delay,
}: {
  video: (typeof VIDEOS)[number];
  visible: boolean;
  delay: number;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden relative flex items-end p-1.5 text-[8px] font-semibold aspect-square"
      style={{
        background: visible ? video.bg : "rgba(0,0,0,0.05)",
        color: visible ? (video.darkText ? "var(--bd-dark)" : "white") : "transparent",
        animation: visible ? `bd-pop-in 0.45s ${delay}ms cubic-bezier(0.2,0.9,0.4,1.2) both` : undefined,
      }}
    >
      {visible && video.src && (
        <video
          // eslint-disable-next-line @next/next/no-img-element
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          src={video.src}
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
          onError={(e) => {
            // If the URL 404s or the video can't decode, hide the
            // <video> element so the colored-tile fallback shows through.
            (e.currentTarget as HTMLVideoElement).style.display = "none";
          }}
        />
      )}
      <span className="relative z-10 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
        {video.label}
      </span>
    </div>
  );
}
