"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { SitePost } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import ReferencesAccordion from "./ReferencesAccordion";
import ShareButtons from "./ShareButtons";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";

export default function PostModal({
  post,
  onClose,
  siteId,
}: {
  post: SitePost | null;
  onClose: () => void;
  siteId?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!post) return;
    returnFocusRef.current = (document.activeElement as HTMLElement) ?? null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex="0"], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), video[controls]',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && active === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const t = setTimeout(() => closeBtnRef.current?.focus(), 50);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      returnFocusRef.current?.focus?.();
    };
  }, [post, onClose]);

  const shareUrl = post
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${window.location.pathname.replace(/\/p\/.*$/, "")}/p/${post.shortcode}`
    : "";

  return (
    <AnimatePresence>
      {post && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={post.title}
            className="relative w-full sm:max-w-3xl max-h-[95dvh] sm:max-h-[92vh] bg-[color:var(--bg)] text-[color:var(--fg)] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile */}
            <div className="sm:hidden pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-[color:var(--fg)]/20" />
            </div>

            <header className="flex items-center gap-3 px-4 h-12 border-b border-[color:var(--border)] shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wide bg-[color:var(--fg)] text-[color:var(--bg)] px-2 py-1 rounded">
                {post.category}
              </span>
              {post.platformUrl && (
                <a
                  href={post.platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hidden sm:inline"
                >
                  View original
                </a>
              )}
              <div className="ml-auto flex items-center gap-1">
                <BookmarkButton shortcode={post.shortcode} size="md" className="hover:bg-[color:var(--fg)]/10" />
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[color:var(--fg)]/10 focus:outline-none focus:ring-2 focus:ring-[color:var(--fg)]"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {/* Media */}
              <div className="bg-black">
                {post.type === "video" && post.mediaUrl ? (
                  <video
                    key={post.shortcode}
                    src={post.mediaUrl}
                    poster={post.thumbUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-[70vh] object-contain bg-black"
                  />
                ) : post.type === "carousel" && post.slides ? (
                  <CarouselMedia slides={post.slides} alt={post.title} />
                ) : post.thumbUrl ? (
                  <div className="relative w-full aspect-square">
                    <Image
                      src={post.thumbUrl}
                      alt={post.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 700px"
                      className="object-contain"
                    />
                  </div>
                ) : null}
              </div>

              {/* Caption + actions */}
              <section className="px-4 pt-4">
                <p className="text-sm whitespace-pre-line leading-relaxed">
                  {post.caption}
                </p>

                {/* Transcript */}
                {post.transcript && (
                  <details className="mt-4">
                    <summary className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] cursor-pointer hover:text-[color:var(--fg)] transition">
                      Transcript
                    </summary>
                    <p className="mt-2 text-sm text-[color:var(--fg-muted)] whitespace-pre-line leading-relaxed bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-3">
                      {post.transcript}
                    </p>
                  </details>
                )}

                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-[color:var(--fg-subtle)]">
                    {formatDate(post.takenAt)}
                  </p>
                  <div className="ml-auto">
                    <ShareButtons url={shareUrl} title={post.title} siteId={siteId} postShortcode={post.shortcode} />
                  </div>
                </div>
                {post.platformUrl && (
                  <a
                    href={post.platformUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm:hidden inline-block mt-3 text-xs text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] underline"
                  >
                    View original
                  </a>
                )}
              </section>

              {/* References */}
              <section className="px-4 pt-6 pb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)]">
                    References
                  </h2>
                  {post.references.length > 0 && (
                    <span className="text-xs text-[color:var(--fg-subtle)]">
                      {post.references.length} source{post.references.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <ReferencesAccordion references={post.references} />
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CarouselMedia({ slides, alt }: { slides: { type: string; src: string }[]; alt: string }) {
  return (
    <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
      {slides.map((s, i) => (
        <div key={i} className="relative shrink-0 w-full snap-center aspect-square">
          <Image src={s.src} alt={`${alt} slide ${i + 1}`} fill sizes="(max-width: 640px) 100vw, 700px" className="object-contain bg-black" />
        </div>
      ))}
    </div>
  );
}
