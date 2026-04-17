"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

const HANDLE = "@catherinetalks";

const VIDEOS: { src: string; bg: string; label: string; darkText?: boolean }[] = [
  {
    src: "/demo-scrape-1.mp4",
    bg: "var(--bd-maroon)",
    label: "Self-care chat",
  },
  {
    src: "/demo-scrape-2.mp4",
    bg: "var(--bd-lilac)",
    label: "Confidence tips",
    darkText: true,
  },
  {
    src: "/demo-scrape-3.mp4",
    bg: "var(--bd-lime)",
    label: "Daily vlog",
    darkText: true,
  },
  {
    src: "/demo-scrape-4.mp4",
    bg: "var(--bd-green)",
    label: "Morning routine",
  },
  {
    src: "/demo-scrape-5.mp4",
    bg: "var(--bd-purple)",
    label: "Q&A reel",
  },
  {
    src: "/demo-scrape-6.mp4",
    bg: "var(--bd-cream-2)",
    label: "Get ready",
    darkText: true,
  },
];

export default function AutoScrapeDemo() {
  const [typed, setTyped] = useState(0);
  const [filled, setFilled] = useState(0); // cards shown (0-6)
  const [postCount, setPostCount] = useState(0); // counter display (0-150)

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t <= 1400) {
        setTyped(Math.min(HANDLE.length, Math.floor(t / 100)));
      } else if (t > 1400 && t <= 2000) {
        setTyped(HANDLE.length);
        setFilled(0);
        setPostCount(0);
      } else if (t > 2000 && t <= 5000) {
        const elapsed = t - 2000;
        setFilled(Math.min(VIDEOS.length, Math.floor(elapsed / 500) + 1));
        setPostCount(Math.min(150, Math.floor((elapsed / 3000) * 150)));
      } else if (t > 5000 && t <= 10000) {
        setFilled(VIDEOS.length);
        setPostCount(150);
      } else {
        t = 0; setTyped(0); setFilled(0); setPostCount(0);
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
        {postCount === 0
          ? "Connecting…"
          : postCount < 150
          ? `Pulling posts… ${postCount}/150`
          : "150 posts found"}
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
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          src={video.src}
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
          onError={(e) => {
            (e.currentTarget as HTMLVideoElement).style.display = "none";
          }}
        />
      )}
    </div>
  );
}
