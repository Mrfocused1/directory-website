"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import EmptyState from "@/components/dashboard/EmptyState";

type Cat = { name: string; count: number };

export default function CategoriesPage() {
  const { selectedSite } = useSiteContext();
  const siteId = selectedSite?.id;
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Add category
  const [addingName, setAddingName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/categories?siteId=${siteId}`);
      const data = await res.json();
      if (res.ok) setCats(data.categories || []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showAdd) addInputRef.current?.focus();
  }, [showAdd]);

  async function rename(from: string) {
    if (!siteId) return;
    const to = newName.trim();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    const existing = cats.find((c) => c.name.toLowerCase() === to.toLowerCase());
    const action = existing ? "merge" : "rename";
    if (action === "merge" && !confirm(`"${to}" already has ${existing!.count} posts. Merge "${from}" into "${to}"?`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action, from, to }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
      } else {
        await load();
        setEditing(null);
        setNewName("");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    if (!siteId) return;
    const name = addingName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action: "add", name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add category");
      } else {
        setAddingName("");
        setShowAdd(false);
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(name: string) {
    if (!siteId) return;
    const cat = cats.find((c) => c.name === name);
    const postCount = cat?.count ?? 0;
    const msg = postCount > 0
      ? `Delete "${name}"? Its ${postCount} post${postCount === 1 ? "" : "s"} will move to "Uncategorized".`
      : `Delete the empty category "${name}"?`;
    if (!confirm(msg)) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action: "delete", name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
      } else {
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder(newCats: Cat[]) {
    if (!siteId) return;
    const order = newCats.map((c) => c.name);
    try {
      await fetch("/api/dashboard/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action: "reorder", order }),
      });
    } catch {
      setError("Failed to save order");
    }
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const updated = [...cats];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    setCats(updated);
    setDragIdx(null);
    setDragOverIdx(null);
    void saveOrder(updated);
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function moveCategory(idx: number, direction: "up" | "down") {
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= cats.length) return;
    const updated = [...cats];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    setCats(updated);
    void saveOrder(updated);
  }

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-1">Categories</h1>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Add, rename, reorder, or delete the tabs visitors see on your directory.
            </p>
          </div>
          {!loading && cats.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="h-9 px-4 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 transition whitespace-nowrap shrink-0"
            >
              + Add category
            </button>
          )}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-white border border-[color:var(--border)] rounded-xl p-4 mb-4 flex items-center gap-2 animate-fade-in">
            <input
              ref={addInputRef}
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              maxLength={64}
              placeholder="New category name"
              className="flex-1 h-9 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
                if (e.key === "Escape") { setShowAdd(false); setAddingName(""); }
              }}
            />
            <button
              type="button"
              onClick={addCategory}
              disabled={saving || !addingName.trim()}
              className="h-9 px-3 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 disabled:opacity-50 transition"
            >
              {saving ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddingName(""); }}
              className="h-9 px-3 text-xs font-semibold border border-[color:var(--border)] rounded-lg hover:bg-black/5 transition"
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : cats.length === 0 ? (
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />
              </svg>
            }
            title="No categories yet"
            description="Add posts to your directory and they'll be grouped here, or create one manually."
          >
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="h-9 px-4 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 transition"
            >
              + Add category
            </button>
          </EmptyState>
        ) : (
          <>
            <p className="text-[11px] text-[color:var(--fg-subtle)] mb-2">
              Drag to reorder, or use the arrows. The order here is the order visitors see.
            </p>
            <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
              <ul className="divide-y divide-[color:var(--border)]">
                {cats.map((c, idx) => (
                  <li
                    key={c.name}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      dragOverIdx === idx && dragIdx !== idx ? "bg-purple-50" : ""
                    } ${dragIdx === idx ? "opacity-40" : ""}`}
                  >
                    {editing === c.name ? (
                      <>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          maxLength={64}
                          autoFocus
                          className="flex-1 h-9 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") rename(c.name);
                            if (e.key === "Escape") {
                              setEditing(null);
                              setNewName("");
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => rename(c.name)}
                          disabled={saving}
                          className="h-9 px-3 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setNewName("");
                            setError("");
                          }}
                          className="h-9 px-3 text-xs font-semibold border border-[color:var(--border)] rounded-lg hover:bg-black/5 transition"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Drag handle */}
                        <span className="cursor-grab active:cursor-grabbing text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] shrink-0 touch-none select-none" aria-hidden>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="5" r="1.5" />
                            <circle cx="15" cy="5" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" />
                            <circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="19" r="1.5" />
                            <circle cx="15" cy="19" r="1.5" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{c.name}</p>
                          <p className="text-[11px] text-[color:var(--fg-subtle)]">
                            {c.count} post{c.count === 1 ? "" : "s"}
                          </p>
                        </div>
                        {/* Reorder arrows */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveCategory(idx, "up")}
                            disabled={idx === 0}
                            className="w-6 h-5 flex items-center justify-center text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] disabled:opacity-20 transition"
                            aria-label="Move up"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 15l-6-6-6 6" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCategory(idx, "down")}
                            disabled={idx === cats.length - 1}
                            className="w-6 h-5 flex items-center justify-center text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] disabled:opacity-20 transition"
                            aria-label="Move down"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(c.name);
                            setNewName(c.name);
                            setError("");
                          }}
                          className="h-8 px-3 text-xs font-semibold bg-black/5 rounded-lg hover:bg-black/10 transition"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(c.name)}
                          disabled={c.name.toLowerCase() === "uncategorized"}
                          className="h-8 px-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          aria-label={`Delete ${c.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {error && (
                <div className="border-t border-red-200 bg-red-50 text-red-800 text-xs px-4 py-2">
                  {error}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
