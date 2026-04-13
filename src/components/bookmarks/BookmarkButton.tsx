"use client";

import { useBookmarks } from "./BookmarkProvider";

export default function BookmarkButton({
  shortcode,
  size = "sm",
  className = "",
}: {
  shortcode: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const saved = isBookmarked(shortcode);

  const dims = size === "md" ? "w-10 h-10" : "w-8 h-8";
  const iconSize = size === "md" ? 18 : 15;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleBookmark(shortcode);
      }}
      className={`${dims} flex items-center justify-center rounded-full transition ${
        saved
          ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
          : "bg-white/90 text-[color:var(--fg)] hover:bg-white"
      } ${className}`}
      aria-label={saved ? "Remove bookmark" : "Save to collection"}
      title={saved ? "Saved" : "Save"}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
    </button>
  );
}
