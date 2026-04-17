"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { SitePost } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import ReferencesAccordion from "./ReferencesAccordion";
import ShareButtons from "./ShareButtons";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import { SUPPORTED_LANGUAGES } from "@/lib/translate";
import DubbingButton from "./DubbingButton";

export default function PostModal({
  post,
  onClose,
  siteId,
  ttsEnabled = false,
  dubbingEnabled = false,
}: {
  post: SitePost | null;
  onClose: () => void;
  siteId?: string;
  ttsEnabled?: boolean;
  dubbingEnabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dubbedSrc, setDubbedSrc] = useState<string | null>(null);
  const dubbedAudioRef = useRef<HTMLAudioElement | null>(null);

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

  const seekTo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  }, []);

  const shareUrl = post && typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname.replace(/\/p\/.*$/, "")}/p/${post.shortcode}`
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
              <div className="bg-black relative">
                {post.type === "video" && post.mediaUrl ? (
                  <video
                    ref={videoRef}
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

                {/* Dubbing overlay — language selector on the video */}
                {dubbingEnabled && post.type === "video" && post.mediaUrl && post.id && (
                  <div className="absolute top-3 right-3 z-10">
                    <DubbingButton
                      postId={post.id}
                      siteId={siteId || ""}
                      hasDubbingFeature={true}
                      onDubbedVideoReady={(audioUrl) => {
                        setDubbedSrc(audioUrl);
                        // Mute video + play cloned audio in sync
                        if (videoRef.current) {
                          videoRef.current.muted = true;
                          videoRef.current.currentTime = 0;
                          videoRef.current.play();
                        }
                        const audio = new Audio(audioUrl);
                        dubbedAudioRef.current = audio;
                        audio.play();
                      }}
                    />
                    {dubbedSrc && (
                      <button
                        type="button"
                        onClick={() => {
                          setDubbedSrc(null);
                          if (videoRef.current) videoRef.current.muted = false;
                          if (dubbedAudioRef.current) {
                            dubbedAudioRef.current.pause();
                            dubbedAudioRef.current = null;
                          }
                        }}
                        className="mt-1 w-full text-[10px] text-white/70 hover:text-white bg-black/50 rounded px-2 py-1 transition"
                      >
                        Original
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Chapters */}
              {post.transcriptSegments && post.transcriptSegments.length > 0 && (
                <ChaptersAccordion segments={post.transcriptSegments} onSeek={seekTo} />
              )}

              {/* Caption + actions */}
              <section className="px-4 pt-4">
                <p className="text-sm whitespace-pre-line leading-relaxed">
                  {post.caption}
                </p>

                {/* AI Summary */}
                {post.summary && (
                  <div className="mt-4 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] mb-2">
                      Key Takeaways
                    </p>
                    <ul className="space-y-1">
                      {post.summary.split("\n").filter((line) => line.trim().startsWith("-")).map((line, i) => (
                        <li key={i} className="text-xs text-[color:var(--fg-muted)] leading-relaxed flex gap-1.5">
                          <span className="text-[color:var(--fg-subtle)] shrink-0">&#8226;</span>
                          <span>{line.trim().replace(/^-\s*/, "")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Transcript */}
                {post.transcript && (
                  <TranscriptSection transcript={post.transcript} ttsEnabled={ttsEnabled} />
                )}

                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-[color:var(--fg-subtle)]">
                    {formatDate(post.takenAt)}
                  </p>
                  <div className="ml-auto">
                    <ShareButtons url={shareUrl} title={post.title} siteId={siteId} postShortcode={post.shortcode} />
                  </div>
                </div>
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

/* ------------------------------------------------------------------ */
/*  Video chapters                                                     */
/* ------------------------------------------------------------------ */

type Segment = { start: number; end: number; text: string };

/**
 * Build talking points from transcript segments.
 *
 * Detects whether segments are AI-curated talking points (short titles,
 * 3-8 items) or raw transcription chunks (long text, many items), and
 * handles each case differently.
 */
function buildChapters(segments: Segment[]): { start: number; text: string }[] {
  if (segments.length === 0) return [];

  // AI-curated talking points: typically 3-8 segments with short, descriptive text
  // Raw transcription: many segments (10+) with long sentence fragments
  const avgTextLen = segments.reduce((sum, s) => sum + s.text.length, 0) / segments.length;
  const isCurated = segments.length <= 10 && avgTextLen < 100;

  if (isCurated) {
    // Already curated by Claude — use directly
    return segments.map((s) => ({ start: s.start, text: s.text.trim() }));
  }

  // Raw transcription — merge into ~30-second windows
  const chapters: { start: number; text: string }[] = [];
  let chunkStart = segments[0].start;
  let chunkTexts: string[] = [];

  for (const seg of segments) {
    if (seg.start - chunkStart >= 30 && chunkTexts.length > 0) {
      chapters.push({ start: chunkStart, text: chunkTexts.join(" ") });
      chunkStart = seg.start;
      chunkTexts = [];
    }
    chunkTexts.push(seg.text.trim());
  }
  if (chunkTexts.length > 0) {
    chapters.push({ start: chunkStart, text: chunkTexts.join(" ") });
  }

  return chapters;
}

/** Format seconds as M:SS */
function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ChaptersAccordion({
  segments,
  onSeek,
}: {
  segments: Segment[];
  onSeek: (seconds: number) => void;
}) {
  const chapters = buildChapters(segments);
  if (chapters.length === 0) return null;

  return (
    <details className="px-4 pt-3">
      <summary className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] cursor-pointer hover:text-[color:var(--fg)] transition select-none">
        Talking Points &middot; {chapters.length}
      </summary>
      <ul className="mt-2 space-y-1">
        {chapters.map((ch, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSeek(ch.start)}
              className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[color:var(--fg)]/5 transition group"
            >
              <span className="shrink-0 text-xs font-mono text-[color:var(--fg-subtle)] group-hover:text-[color:var(--fg)] tabular-nums mt-px">
                {fmtTime(ch.start)}
              </span>
              <span className="text-xs text-[color:var(--fg-muted)] group-hover:text-[color:var(--fg)] leading-relaxed line-clamp-1">
                {ch.text.length > 60 ? ch.text.slice(0, 60) + "\u2026" : ch.text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/*  Transcript with translation support                               */
/* ------------------------------------------------------------------ */

// English excluded from TTS — play the original video instead
const TTS_LANGS = ["es", "fr", "de", "pt"];

function TranscriptSection({ transcript, ttsEnabled = false }: { transcript: string; ttsEnabled?: boolean }) {
  const [selectedLang, setSelectedLang] = useState("");
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Record<string, string>>({});
  // Cache: lang code -> translated string
  const cacheRef = useRef<Record<string, string>>({});

  const handleTranslate = useCallback(
    async (langCode: string) => {
      if (!langCode) {
        setShowTranslated(false);
        setSelectedLang("");
        return;
      }

      setSelectedLang(langCode);

      // Return cached result if available
      if (cacheRef.current[langCode]) {
        setTranslatedText(cacheRef.current[langCode]);
        setShowTranslated(true);
        return;
      }

      setTranslating(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: transcript, targetLang: langCode }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const result: string = data.translated ?? transcript;
        cacheRef.current[langCode] = result;
        setTranslatedText(result);
        setShowTranslated(true);
      } catch (err) {
        console.error("[TranscriptSection] translation failed:", err);
        // On failure just keep showing original
      } finally {
        setTranslating(false);
      }
    },
    [transcript],
  );

  return (
    <details className="mt-4">
      <summary className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] cursor-pointer hover:text-[color:var(--fg)] transition">
        Transcript
      </summary>

      {/* Language selector */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <label
          htmlFor="translate-lang"
          className="text-xs text-[color:var(--fg-subtle)]"
        >
          Translate transcript:
        </label>
        <select
          id="translate-lang"
          value={selectedLang}
          onChange={(e) => handleTranslate(e.target.value)}
          className="text-xs rounded border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--fg)] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[color:var(--fg)]"
        >
          <option value="">Original</option>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>

        {translating && (
          <svg
            className="animate-spin h-4 w-4 text-[color:var(--fg-subtle)]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-label="Translating"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}

        {translatedText && !translating && (
          <button
            type="button"
            onClick={() => {
              setShowTranslated((v) => !v);
            }}
            className="text-xs underline text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] transition"
          >
            {showTranslated ? "Show original" : "Show translation"}
          </button>
        )}

      </div>

      {/* Transcript text */}
      <p className="mt-2 text-sm text-[color:var(--fg-muted)] whitespace-pre-line leading-relaxed bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-3">
        {showTranslated && !translating ? translatedText : transcript}
      </p>

      {/* Play button — TTS for translated text only (not English, plan-gated) */}
      {ttsEnabled && selectedLang && TTS_LANGS.includes(selectedLang) && (
        <button
          type="button"
          aria-label={ttsPlaying ? "Stop listening" : ttsLoading ? "Generating audio" : "Listen in " + (SUPPORTED_LANGUAGES.find(l => l.code === selectedLang)?.name || selectedLang)}
          disabled={ttsLoading || translating}
          onClick={async () => {
            if (ttsPlaying && ttsAudioRef.current) {
              ttsAudioRef.current.pause();
              ttsAudioRef.current.currentTime = 0;
              setTtsPlaying(false);
              return;
            }

            const lang = selectedLang;
            const textToSpeak = (showTranslated && translatedText) ? translatedText : transcript;
            const cacheKey = lang + textToSpeak.slice(0, 50);

            if (ttsCacheRef.current[cacheKey]) {
              const audio = new Audio(ttsCacheRef.current[cacheKey]);
              ttsAudioRef.current = audio;
              audio.onended = () => setTtsPlaying(false);
              audio.play();
              setTtsPlaying(true);
              return;
            }

            setTtsLoading(true);
            try {
              const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textToSpeak.slice(0, 5000), lang, gender: "female" }),
              });
              if (!res.ok) throw new Error("TTS failed");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              ttsCacheRef.current[cacheKey] = url;
              const audio = new Audio(url);
              ttsAudioRef.current = audio;
              audio.onended = () => setTtsPlaying(false);
              audio.play();
              setTtsPlaying(true);
            } catch {
              // silently fail
            } finally {
              setTtsLoading(false);
            }
          }}
          className="mt-3 w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 bg-[color:var(--fg)] text-[color:var(--bg)] hover:opacity-90 whitespace-nowrap overflow-hidden"
        >
          {translating ? (
            <>
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span>Translating...</span>
            </>
          ) : ttsLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span>Generating audio...</span>
            </>
          ) : ttsPlaying ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              <span>Stop listening</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M8 5v14l11-7z" /></svg>
              <span>Listen in {SUPPORTED_LANGUAGES.find(l => l.code === selectedLang)?.name || selectedLang}</span>
            </>
          )}
        </button>
      )}
    </details>
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
