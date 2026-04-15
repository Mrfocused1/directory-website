"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Collection = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  bookmarks: string[];
};

type BookmarkContextValue = {
  isSignedIn: boolean;
  email: string | null;
  collections: Collection[];
  isBookmarked: (shortcode: string) => boolean;
  toggleBookmark: (shortcode: string, collectionId?: string) => Promise<void>;
  createCollection: (name: string, emoji?: string) => Promise<void>;
  signIn: (email: string, name?: string) => Promise<void>;
  signOut: () => void;
  deleteAccount: () => Promise<boolean>;
  showSignIn: boolean;
  setShowSignIn: (show: boolean) => void;
};

const BookmarkContext = createContext<BookmarkContextValue | null>(null);

export function useBookmarks() {
  const ctx = useContext(BookmarkContext);
  if (!ctx) throw new Error("useBookmarks must be inside BookmarkProvider");
  return ctx;
}

export default function BookmarkProvider({
  siteId,
  children,
}: {
  siteId: string;
  children: ReactNode;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showSignIn, setShowSignIn] = useState(false);

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`bmd_bookmark_email_${siteId}`);
    if (stored) {
      setEmail(stored);
      fetchCollections(stored);
    }
  }, [siteId]);

  const fetchCollections = async (userEmail: string) => {
    try {
      const res = await fetch(`/api/bookmarks?siteId=${siteId}&email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      if (data.collections) setCollections(data.collections);
    } catch (err) {
      console.warn("[bookmarks] Failed to fetch collections:", err);
    }
  };

  const signIn = useCallback(async (userEmail: string, name?: string) => {
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, email: userEmail, name, action: "signin" }),
    });
    if (res.ok) {
      const data = await res.json();
      setEmail(userEmail);
      setCollections(data.collections || []);
      localStorage.setItem(`bmd_bookmark_email_${siteId}`, userEmail);
      setShowSignIn(false);
    }
  }, [siteId]);

  const signOut = useCallback(() => {
    setEmail(null);
    setCollections([]);
    localStorage.removeItem(`bmd_bookmark_email_${siteId}`);
  }, [siteId]);

  const deleteAccount = useCallback(async () => {
    if (!email) return false;
    try {
      const res = await fetch("/api/bookmarks/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, email }),
      });
      if (!res.ok) return false;
      setEmail(null);
      setCollections([]);
      localStorage.removeItem(`bmd_bookmark_email_${siteId}`);
      return true;
    } catch {
      return false;
    }
  }, [siteId, email]);

  const isBookmarked = useCallback((shortcode: string) => {
    return collections.some((c) => c.bookmarks.includes(shortcode));
  }, [collections]);

  const toggleBookmark = useCallback(async (shortcode: string, collectionId?: string) => {
    if (!email) {
      setShowSignIn(true);
      return;
    }

    // Save previous state for rollback
    const previousCollections = collections;

    // Optimistic update
    setCollections((prev) =>
      prev.map((c) => {
        const target = collectionId ? c.id === collectionId : c.isDefault;
        if (!target) return c;
        const has = c.bookmarks.includes(shortcode);
        return {
          ...c,
          bookmarks: has
            ? c.bookmarks.filter((b) => b !== shortcode)
            : [...c.bookmarks, shortcode],
        };
      }),
    );

    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, email, action: "bookmark", postShortcode: shortcode, collectionId }),
      });
      if (!res.ok) {
        setCollections(previousCollections);
      }
    } catch {
      setCollections(previousCollections);
    }
  }, [email, siteId, collections]);

  const createCollection = useCallback(async (name: string, emoji?: string) => {
    if (!email) return;
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, email, action: "create_collection", collectionName: name, emoji }),
    });
    if (res.ok) {
      const data = await res.json();
      setCollections((prev) => [...prev, data.collection]);
    }
  }, [email, siteId]);

  return (
    <BookmarkContext.Provider
      value={{
        isSignedIn: !!email,
        email,
        collections,
        isBookmarked,
        toggleBookmark,
        createCollection,
        signIn,
        signOut,
        deleteAccount,
        showSignIn,
        setShowSignIn,
      }}
    >
      {children}
    </BookmarkContext.Provider>
  );
}
