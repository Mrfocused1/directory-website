"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  isFeatured: boolean;
  sortOrder?: number;
  createdAt: string;
};

export default function PostsPage() {
  const { selectedSite, refresh: refreshSites } = useSiteContext();
  const siteId = selectedSite?.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Post | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drag-and-drop reorder. Stores the post id currently being dragged.
  const draggingId = useRef<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  // Layout (2 vs 3 columns). Reads from site config; PATCH on toggle.
  const gridColumns = (selectedSite?.gridColumns as 2 | 3 | undefined) || 3;
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);

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

  async function toggleFeatured(post: Post) {
    const next = !post.isFeatured;
    await fetch(`/api/dashboard/posts?id=${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFeatured: next }),
    });
    // Pinned posts always sort to the top; reload to reflect new order
    setPosts((ps) => {
      const updated = ps.map((p) => (p.id === post.id ? { ...p, isFeatured: next } : p));
      return [...updated].sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    });
  }

  // ── Drag-and-drop reorder ────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, id: string) {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
    // Some browsers require a setData call to actually start the drag
    e.dataTransfer.setData("text/plain", id);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  async function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = draggingId.current;
    draggingId.current = null;
    if (!sourceId || sourceId === targetId || !siteId) return;

    const sourceIdx = posts.findIndex((p) => p.id === sourceId);
    const targetIdx = posts.findIndex((p) => p.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const reordered = [...posts];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setPosts(reordered);

    setReordering(true);
    setReorderError(null);
    try {
      const res = await fetch("/api/dashboard/posts/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, ids: reordered.map((p) => p.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReorderError(data.error || "Reorder failed");
        // Roll back optimistic move
        setPosts(posts);
      }
    } catch {
      setReorderError("Network error");
      setPosts(posts);
    } finally {
      setReordering(false);
    }
  }

  // Move helpers (click-based fallback for keyboard / non-drag users)
  async function move(id: string, dir: -1 | 1) {
    if (!siteId) return;
    const idx = posts.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= posts.length) return;
    const reordered = [...posts];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setPosts(reordered);
    await fetch("/api/dashboard/posts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, ids: reordered.map((p) => p.id) }),
    });
  }

  // ── Layout toggle (2 vs 3 columns) ───────────────────────────────
  async function setLayout(cols: 2 | 3) {
    if (!siteId || cols === gridColumns || layoutSaving) return;
    setLayoutSaving(true);
    setLayoutError(null);
    try {
      const res = await fetch(`/api/sites?id=${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gridColumns: cols }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLayoutError(data.error || "Failed to save layout");
      } else {
        await refreshSites();
      }
    } catch {
      setLayoutError("Network error");
    } finally {
      setLayoutSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "hide" | "show" | "feature" | "unfeature" | "delete") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} post(s)? This can't be undone.`)) return;
    const res = await fetch("/api/dashboard/posts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Bulk action failed.");
      return;
    }
    if (action === "delete") {
      setPosts((ps) => ps.filter((p) => !selected.has(p.id)));
    } else {
      const map: Record<string, Partial<Post>> = {
        hide: { isVisible: false },
        show: { isVisible: true },
        feature: { isFeatured: true },
        unfeature: { isFeatured: false },
      };
      setPosts((ps) => ps.map((p) => (selected.has(p.id) ? { ...p, ...map[action] } : p)));
    }
    setSelected(new Set());
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
              Pin, reorder by drag, edit titles + categories, hide or delete posts.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mobile-only layout toggle. Desktop keeps its natural
                responsive flow (3-up at sm, 4-up at lg) regardless. */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[color:var(--fg-muted)]">
                Mobile layout
              </span>
              <div className="inline-flex border border-[color:var(--border)] rounded-lg overflow-hidden">
                {([2, 3] as const).map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => setLayout(cols)}
                    disabled={layoutSaving}
                    className={`px-2.5 h-9 text-xs font-semibold transition flex items-center gap-1 ${
                      gridColumns === cols
                        ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
                        : "bg-white hover:bg-black/5"
                    } disabled:opacity-50`}
                    aria-pressed={gridColumns === cols}
                    title={`Show ${cols} columns on phones (desktop is unchanged)`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      {cols === 2 ? (
                        <>
                          <rect x="3" y="3" width="8" height="18" rx="1" />
                          <rect x="13" y="3" width="8" height="18" rx="1" />
                        </>
                      ) : (
                        <>
                          <rect x="2" y="3" width="6" height="18" rx="1" />
                          <rect x="9" y="3" width="6" height="18" rx="1" />
                          <rect x="16" y="3" width="6" height="18" rx="1" />
                        </>
                      )}
                    </svg>
                    {cols}
                  </button>
                ))}
              </div>
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
        </div>

        {layoutError && (
          <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            {layoutError}
          </div>
        )}
        {reorderError && (
          <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            {reorderError}
          </div>
        )}
        {!search && !loading && posts.length > 1 && (
          <div className="mb-3 text-[11px] text-[color:var(--fg-subtle)] flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 3h6M9 21h6M3 9v6M21 9v6M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3" />
            </svg>
            Drag any tile to reorder, or use the ↑↓ buttons.{" "}
            {reordering && <span className="ml-1">Saving…</span>}
          </div>
        )}

        {selected.size > 0 && (
          <div className="sticky top-2 z-20 mb-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-lg">
            <span className="text-xs font-semibold">
              {selected.size} selected
            </span>
            <div className="flex gap-1 flex-wrap">
              <button type="button" onClick={() => runBulk("feature")} className="h-8 px-3 text-xs font-semibold bg-white/15 rounded hover:bg-white/25 transition">Pin</button>
              <button type="button" onClick={() => runBulk("unfeature")} className="h-8 px-3 text-xs font-semibold bg-white/15 rounded hover:bg-white/25 transition">Unpin</button>
              <button type="button" onClick={() => runBulk("hide")} className="h-8 px-3 text-xs font-semibold bg-white/15 rounded hover:bg-white/25 transition">Hide</button>
              <button type="button" onClick={() => runBulk("show")} className="h-8 px-3 text-xs font-semibold bg-white/15 rounded hover:bg-white/25 transition">Show</button>
              <button type="button" onClick={() => runBulk("delete")} className="h-8 px-3 text-xs font-semibold bg-red-500 rounded hover:bg-red-600 transition">Delete</button>
              <button type="button" onClick={() => setSelected(new Set())} className="h-8 px-3 text-xs font-semibold bg-white/15 rounded hover:bg-white/25 transition">Clear</button>
            </div>
          </div>
        )}

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
            {filtered.map((p, idx) => (
              <div
                key={p.id}
                draggable={!search}
                onDragStart={(e) => handleDragStart(e, p.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, p.id)}
                className={`bg-white border rounded-xl overflow-hidden flex flex-col ${
                  selected.has(p.id) ? "border-[color:var(--fg)] ring-2 ring-[color:var(--fg)]/20" : "border-[color:var(--border)]"
                } ${p.isVisible ? "" : "opacity-60"} ${!search ? "cursor-move" : ""}`}
              >
                <div className="aspect-[4/5] bg-black/5 relative overflow-hidden">
                  <label className="absolute top-2 right-2 z-10 w-6 h-6 bg-white rounded shadow cursor-pointer flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="w-4 h-4 cursor-pointer"
                      aria-label={`Select ${p.title || p.shortcode}`}
                    />
                  </label>
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[color:var(--fg-subtle)] text-xs">
                      No preview
                    </div>
                  )}
                  {p.isFeatured && (
                    <div className="absolute top-2 left-2 text-[10px] font-bold uppercase bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
                      Pinned
                    </div>
                  )}
                  {!p.isVisible && (
                    <div className={`absolute ${p.isFeatured ? "top-8" : "top-2"} left-2 text-[10px] font-bold uppercase bg-black text-white px-1.5 py-0.5 rounded`}>
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
                  {!search && (
                    <div className="flex gap-0.5 mt-2 mb-1">
                      <button
                        type="button"
                        onClick={() => move(p.id, -1)}
                        disabled={idx === 0}
                        className="flex-1 h-6 text-[11px] font-semibold bg-black/5 rounded hover:bg-black/10 transition disabled:opacity-30"
                        title="Move up"
                        aria-label="Move post up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(p.id, 1)}
                        disabled={idx === filtered.length - 1}
                        className="flex-1 h-6 text-[11px] font-semibold bg-black/5 rounded hover:bg-black/10 transition disabled:opacity-30"
                        title="Move down"
                        aria-label="Move post down"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                  <div className="flex gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="flex-1 h-7 text-[11px] font-semibold bg-black/5 rounded hover:bg-black/10 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFeatured(p)}
                      className={`h-7 px-2 text-[11px] font-semibold rounded transition ${
                        p.isFeatured
                          ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                          : "bg-black/5 hover:bg-black/10"
                      }`}
                      title={p.isFeatured ? "Unpin from top" : "Pin to top"}
                      aria-label={p.isFeatured ? "Unpin post" : "Pin post"}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
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

          <ReferencesEditor postId={post.id} />

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

// ─── References editor ─────────────────────────────────────────────────
type RefRow = {
  id: string;
  kind: "youtube" | "article";
  title: string;
  url: string | null;
  videoId: string | null;
  note: string | null;
};

function ReferencesEditor({ postId }: { postId: string }) {
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RefRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/dashboard/posts/${postId}/references`);
      const data = await r.json();
      if (r.ok) setRefs(data.references || []);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this reference?")) return;
    const r = await fetch(`/api/dashboard/posts/${postId}/references?refId=${id}`, {
      method: "DELETE",
    });
    if (r.ok) setRefs((rs) => rs.filter((x) => x.id !== id));
    else setError("Delete failed");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold">References</label>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="text-[11px] font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
        >
          + Add reference
        </button>
      </div>
      <p className="text-[11px] text-[color:var(--fg-subtle)] mb-2">
        Sources, videos, brands, or further reading shown in the post modal.
      </p>

      {loading ? (
        <div className="text-[11px] text-[color:var(--fg-subtle)] py-2">Loading…</div>
      ) : refs.length === 0 ? (
        <div className="text-[11px] text-[color:var(--fg-subtle)] py-2 px-3 bg-black/[0.02] border border-dashed border-[color:var(--border)] rounded-lg">
          None yet. Click &quot;Add reference&quot; to add one.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {refs.map((r) => (
            <li key={r.id} className="flex items-start gap-2 bg-black/[0.02] border border-[color:var(--border)] rounded-lg px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider mt-1 px-1.5 py-0.5 rounded shrink-0 w-16 text-center"
                style={{
                  background: r.kind === "youtube" ? "#fee2e2" : "#dbeafe",
                  color: r.kind === "youtube" ? "#991b1b" : "#1e40af",
                }}
              >
                {r.kind}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{r.title}</div>
                {r.note && (
                  <div className="text-[11px] text-[color:var(--fg-subtle)] line-clamp-1">{r.note}</div>
                )}
                <div className="text-[11px] text-[color:var(--fg-subtle)] truncate">
                  {r.kind === "youtube" && r.videoId ? `youtube.com/watch?v=${r.videoId}` : r.url}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-[11px] font-semibold px-2 py-1 hover:bg-black/5 rounded"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="text-[11px] font-semibold px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      {(showAdd || editing) && (
        <RefForm
          postId={postId}
          existing={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setRefs((rs) => {
              const idx = rs.findIndex((x) => x.id === saved.id);
              if (idx >= 0) {
                const next = rs.slice();
                next[idx] = saved;
                return next;
              }
              return [...rs, saved];
            });
            setShowAdd(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RefForm({
  postId,
  existing,
  onClose,
  onSaved,
}: {
  postId: string;
  existing: RefRow | null;
  onClose: () => void;
  onSaved: (r: RefRow) => void;
}) {
  const [kind, setKind] = useState<"youtube" | "article">(existing?.kind || "article");
  const [title, setTitle] = useState(existing?.title || "");
  const [url, setUrl] = useState(existing?.url || "");
  const [videoId, setVideoId] = useState(existing?.videoId || "");
  const [note, setNote] = useState(existing?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const url2 = existing
        ? `/api/dashboard/posts/${postId}/references?refId=${existing.id}`
        : `/api/dashboard/posts/${postId}/references`;
      const res = await fetch(url2, {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          url: url.trim() || null,
          videoId: kind === "youtube" ? videoId.trim() || null : null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      onSaved(data.reference);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold mb-3">
          {existing ? "Edit reference" : "Add reference"}
        </h3>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            {(["article", "youtube"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 h-9 px-3 text-xs font-semibold rounded-lg border-2 transition ${
                  kind === k
                    ? "border-[color:var(--fg)] bg-black/5"
                    : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
                }`}
              >
                {k === "article" ? "Website / Article" : "YouTube"}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Title (e.g. Vanguard Investor)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />

          {kind === "youtube" && (
            <input
              type="text"
              placeholder="Video ID (11 chars, optional)"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              maxLength={11}
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition font-mono"
            />
          )}

          <input
            type="url"
            placeholder={kind === "youtube" ? "OR YouTube URL (channel / search OK)" : "Destination URL"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />

          <input
            type="text"
            placeholder='Optional one-line "why click" note'
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 text-xs font-semibold border border-[color:var(--border)] rounded-lg hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="h-9 px-4 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : existing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
