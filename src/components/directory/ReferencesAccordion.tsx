"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Reference } from "@/lib/types";

function isArticle(r: Reference): r is Extract<Reference, { kind: "article" }> {
  return r.kind === "article";
}

export default function ReferencesAccordion({
  references,
}: {
  references: Reference[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (references.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--border)] p-4 text-sm text-[color:var(--fg-subtle)] bg-[color:var(--card)]">
        No references have been added to this post yet.
      </div>
    );
  }

  const articles = references.filter(isArticle);
  const videos = references.filter((r) => !isArticle(r)) as Extract<Reference, { kind: "youtube" }>[];

  return (
    <div className="space-y-5">
      {articles.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-2">
            Sources cited in caption
          </h3>
          <ul className="flex flex-wrap gap-2">
            {articles.map((ref, i) => (
              <li key={`a-${i}`}>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--fg)] bg-[color:var(--card)] border border-[color:var(--border)] rounded-full px-3 py-1.5 hover:bg-[color:var(--fg)] hover:text-[color:var(--bg)] transition"
                >
                  {ref.title}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M7 17L17 7M17 7H9M17 7v8" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {videos.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-2">
            YouTube coverage of this topic
          </h3>
          <ul className="divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] overflow-hidden bg-[color:var(--card)]">
            {videos.map((ref) => {
              const isOpen = openId === ref.videoId;
              return (
                <li key={ref.videoId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : ref.videoId)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[color:var(--fg)]/5 transition"
                    aria-expanded={isOpen}
                    aria-controls={`ref-panel-${ref.videoId}`}
                  >
                    <span className="mt-0.5 text-red-600 shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.51 2.51 0 0 0-1.77 1.77A26.3 26.3 0 0 0 2 12a26.3 26.3 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.3 26.3 0 0 0 22 12a26.3 26.3 0 0 0-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
                      </svg>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold">{ref.title}</span>
                      {ref.note && <span className="block text-xs text-[color:var(--fg-subtle)] mt-0.5">{ref.note}</span>}
                    </span>
                    <span className={`mt-0.5 text-[color:var(--fg-subtle)] transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`ref-panel-${ref.videoId}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">
                          <div className="relative w-full overflow-hidden rounded-md bg-black" style={{ aspectRatio: "16 / 9" }}>
                            <iframe
                              src={`https://www.youtube-nocookie.com/embed/${ref.videoId}?rel=0`}
                              title={ref.title}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              referrerPolicy="strict-origin-when-cross-origin"
                              className="absolute inset-0 w-full h-full border-0"
                              loading="lazy"
                            />
                          </div>
                          <div className="mt-2 flex gap-3 text-xs">
                            <a
                              href={`https://www.youtube.com/watch?v=${ref.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
                            >
                              Open on YouTube
                            </a>
                            <button type="button" onClick={() => setOpenId(null)} className="ml-auto text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]">
                              Close
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
