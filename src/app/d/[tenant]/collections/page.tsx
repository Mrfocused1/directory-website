"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type Collection = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  bookmarks: string[];
};

export default function CollectionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;

  const [email, setEmail] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(`bmd_bookmark_email_${tenant}`);
    if (stored) {
      setEmail(stored);
    }
  }, [tenant]);

  const fetchCollections = useCallback(async () => {
    if (!email) return;
    const res = await fetch(`/api/bookmarks?siteId=${tenant}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.collections) {
      setCollections(data.collections);
      if (!activeTab && data.collections.length > 0) {
        setActiveTab(data.collections[0].id);
      }
    }
  }, [tenant, email, activeTab]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !email) return;
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: tenant,
        email,
        action: "create_collection",
        collectionName: newName,
        emoji: newEmoji,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setCollections((prev) => [...prev, data.collection]);
      setActiveTab(data.collection.id);
      setNewName("");
      setNewEmoji("");
      setShowNewForm(false);
    }
  };

  const handleRemoveBookmark = async (shortcode: string, collectionId: string) => {
    // Optimistic
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, bookmarks: c.bookmarks.filter((b) => b !== shortcode) }
          : c,
      ),
    );
    await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: tenant,
        email,
        action: "bookmark",
        postShortcode: shortcode,
        collectionId,
      }),
    });
  };

  const activeCollection = collections.find((c) => c.id === activeTab);

  if (!email) {
    return (
      <div className="min-h-screen relative">
        <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
        <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />
        <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2">Your Collections</h1>
            <p className="text-sm text-[color:var(--fg-muted)] mb-6">
              Save posts to collections by clicking the bookmark icon. Sign in with your email to get started.
            </p>
            <a
              href={`/d/${tenant}`}
              className="inline-flex h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
            >
              Browse Directory
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <main className="container mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-20 max-w-3xl">
          {/* Header */}
          <header className="text-center mb-8 animate-fade-in">
            <a href={`/d/${tenant}`} className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition">
              &larr; Back to directory
            </a>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mt-3 mb-2">
              Your Collections
            </h1>
            <p className="text-sm text-[color:var(--fg-muted)]">
              {collections.reduce((s, c) => s + c.bookmarks.length, 0)} saved posts across {collections.length} collection{collections.length !== 1 ? "s" : ""}
            </p>
          </header>

          {/* Collection tabs */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveTab(c.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition ${
                  activeTab === c.id
                    ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
                    : "bg-black/5 text-[color:var(--fg-muted)] hover:bg-black/10"
                }`}
              >
                {c.emoji && <span>{c.emoji}</span>}
                {c.name}
                <span className="text-xs opacity-60 tabular-nums">({c.bookmarks.length})</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowNewForm(!showNewForm)}
              className="flex items-center gap-1 px-3 py-2 rounded-full text-sm font-semibold bg-black/5 text-[color:var(--fg-muted)] hover:bg-black/10 transition whitespace-nowrap shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>
          </div>

          {/* New collection form */}
          <AnimatePresence>
            {showNewForm && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mb-6"
                onSubmit={handleCreateCollection}
              >
                <div className="bg-white border-2 border-[color:var(--fg)] rounded-xl p-4 flex items-center gap-3">
                  <input
                    type="text"
                    value={newEmoji}
                    onChange={(e) => setNewEmoji(e.target.value)}
                    placeholder="Icon"
                    maxLength={2}
                    className="w-12 h-10 text-center bg-black/5 rounded-lg text-lg focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Collection name"
                    required
                    maxLength={64}
                    className="flex-1 h-10 px-3 bg-white border border-[color:var(--border)] rounded-lg text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                  <button
                    type="submit"
                    className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition"
                  >
                    Create
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Bookmarked posts */}
          {activeCollection ? (
            activeCollection.bookmarks.length > 0 ? (
              <div className="space-y-2">
                {activeCollection.bookmarks.map((shortcode) => (
                  <div
                    key={shortcode}
                    className="bg-white border border-[color:var(--border)] rounded-xl p-4 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-lg bg-black/5 shrink-0 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-[color:var(--fg-muted)]">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <a
                        href={`/d/${tenant}/p/${shortcode}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {shortcode}
                      </a>
                      <p className="text-xs text-[color:var(--fg-subtle)]">
                        In {activeCollection.emoji} {activeCollection.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBookmark(shortcode, activeCollection.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-[color:var(--fg-subtle)] hover:text-red-600 transition shrink-0"
                      aria-label="Remove bookmark"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white border border-dashed border-[color:var(--border)] rounded-2xl">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-[color:var(--fg-subtle)] mb-3">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
                <h3 className="text-lg font-bold mb-1">No posts saved yet</h3>
                <p className="text-sm text-[color:var(--fg-muted)] mb-4">
                  Click the bookmark icon on any post to save it here.
                </p>
                <a
                  href={`/d/${tenant}`}
                  className="inline-flex h-10 px-6 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-sm font-semibold items-center hover:opacity-90 transition"
                >
                  Browse posts
                </a>
              </div>
            )
          ) : null}
        </main>
      </div>
    </div>
  );
}
