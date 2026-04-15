"use client";

import { useBookmarks } from "./BookmarkProvider";

/**
 * Small pill in the directory header showing bookmark count + link to collections.
 * Only visible when the visitor is signed in and has bookmarks.
 */
export default function CollectionsHeader({ tenantSlug }: { tenantSlug: string }) {
  const { isSignedIn, collections, email, signOut, deleteAccount } = useBookmarks();

  const totalBookmarks = collections.reduce((sum, c) => sum + c.bookmarks.length, 0);

  if (!isSignedIn || totalBookmarks === 0) return null;

  const handleDelete = async () => {
    if (
      !confirm(
        "Delete all your data from this directory (bookmarks, collections, profile)? This can't be undone.",
      )
    ) {
      return;
    }
    const ok = await deleteAccount();
    if (!ok) alert("Failed to delete. Please try again.");
  };

  return (
    <div className="flex items-center justify-center gap-3 mt-3">
      <a
        href={`/d/${tenantSlug}/collections`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--fg)] bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded-full transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
        {totalBookmarks} saved
      </a>
      <button
        type="button"
        onClick={signOut}
        className="text-[11px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] transition"
        title={`Signed in as ${email}`}
      >
        Sign out
      </button>
      <button
        type="button"
        onClick={handleDelete}
        className="text-[11px] text-red-500/70 hover:text-red-700 transition"
        title="Delete all your data"
      >
        Delete my data
      </button>
    </div>
  );
}
