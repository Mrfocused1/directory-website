"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import EmptyState from "@/components/dashboard/EmptyState";

type Post = {
  id: string;
  shortcode: string;
  type: string;
  title: string | null;
  caption: string | null;
  category: string;
  thumbUrl: string | null;
  mediaUrl: string | null;
  platformUrl: string | null;
  takenAt: string | null;
  isVisible: boolean;
  createdAt: string;
};

export default function PostsPage() {
  const { selectedSite } = useSiteContext();
  const siteId = selectedSite?.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Post | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/posts?siteId=${siteId}`);
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePostVisibility(post: Post) {
    await fetch(`/api/dashboard/posts?id=${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVisible: !post.isVisible }),
    });
    setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, isVisible: !p.isVisible } : p)));
  }

  async function deletePost(post: Post) {
    if (!confirm(`Delete "${post.title || post.shortcode}"? This can't be undone.`)) return;
    const res = await fetch(`/api/dashboard/posts?id=${post.id}`, { method: "DELETE" });
    if (res.ok) setPosts((ps) => ps.filter((p) => p.id !== post.id));
  }

  const filtered = search.trim()
    ? posts.filter((p) => {
        const q = search.toLowerCase();
        return (
          (p.title || "").toLowerCase().includes(q) ||
          (p.caption || "").toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.shortcode.toLowerCase().includes(q)
        );
      })
    : posts;

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-10 py-8">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-1">Posts</h1>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Edit titles, captions, categories, hide or delete posts.
            </p>
          </div>
          {posts.length > 0 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="h-10 px-3 w-64 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
          )}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 9h6M9 13h6M9 17h3" />
              </svg>
            }
            title="No posts yet"
            description="Connect a platform from the Platforms tab to import content into your directory."
            action={{ href: "/dashboard/platforms", label: "Connect a platform" }}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <div
                key={p.id}
                className={`bg-white border border-[color:var(--border)] rounded-xl overflow-hidden flex flex-col ${
                  p.isVisible ? "" : "opacity-60"
                }`}
              >
                <div className="aspect-[4/5] bg-black/5 relative overflow-hidden">
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[color:var(--fg-subtle)] text-xs">
                      No preview
                    </div>
                  )}
                  {!p.isVisible && (
                    <div className="absolute top-2 left-2 text-[10px] font-bold uppercase bg-black text-white px-1.5 py-0.5 rounded">
                      Hidden
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">
                    {p.category}
                  </p>
                  <p className="text-xs font-semibold line-clamp-2 mb-1">
                    {p.title || p.shortcode}
                  </p>
                  <p className="text-[11px] text-[color:var(--fg-subtle)] line-clamp-2 flex-1">
                    {p.caption}
                  </p>
                  <div className="flex gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="flex-1 h-7 text-[11px] font-semibold bg-black/5 rounded hover:bg-black/10 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePostVisibility(p)}
                      className="h-7 px-2 text-[11px] font-semibold bg-black/5 rounded hover:bg-black/10 transition"
                      title={p.isVisible ? "Hide" : "Show"}
                    >
                      {p.isVisible ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePost(p)}
                      className="h-7 px-2 text-[11px] font-semibold text-red-600 bg-red-50 rounded hover:bg-red-100 transition"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          post={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setPosts((ps) => ps.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

function EditModal({
  post,
  onClose,
  onSaved,
}: {
  post: Post;
  onClose: () => void;
  onSaved: (p: Post) => void;
}) {
  const [title, setTitle] = useState(post.title || "");
  const [caption, setCaption] = useState(post.caption || "");
  const [category, setCategory] = useState(post.category);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/posts?id=${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          caption: caption.trim() || null,
          category: category.trim() || "Uncategorized",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onSaved({
          ...post,
          title: title.trim() || null,
          caption: caption.trim() || null,
          category: category.trim() || "Uncategorized",
        });
      } else {
        setError(data.error || "Save failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">Edit post</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="p-title" className="text-xs font-semibold mb-1.5 block">
              Title
            </label>
            <input
              id="p-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
          </div>
          <div>
            <label htmlFor="p-cat" className="text-xs font-semibold mb-1.5 block">
              Category
            </label>
            <input
              id="p-cat"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={64}
              required
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
          </div>
          <div>
            <label htmlFor="p-cap" className="text-xs font-semibold mb-1.5 block">
              Caption
            </label>
            <textarea
              id="p-cap"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              maxLength={10000}
              className="w-full px-3 py-2 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition resize-none"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 text-xs font-semibold border border-[color:var(--border)] rounded-lg hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-4 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
