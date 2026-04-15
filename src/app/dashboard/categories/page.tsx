"use client";

import { useCallback, useEffect, useState } from "react";
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

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Categories</h1>
          <p className="text-sm text-[color:var(--fg-muted)]">
            Rename a category to update every post at once. Renaming to an existing category merges them.
          </p>
        </div>

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
            description="Add posts to your directory and they'll be grouped here."
          />
        ) : (
          <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
            <ul className="divide-y divide-[color:var(--border)]">
              {cats.map((c) => (
                <li key={c.name} className="px-4 py-3 flex items-center justify-between gap-3">
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
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{c.name}</p>
                        <p className="text-[11px] text-[color:var(--fg-subtle)]">
                          {c.count} post{c.count === 1 ? "" : "s"}
                        </p>
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
        )}
      </div>
    </main>
  );
}
