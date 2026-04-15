"use client";

import { createContext, useContext, useEffect, useState, type ReactNode, useCallback } from "react";

export type DashboardSite = {
  id: string;
  slug: string;
  displayName: string | null;
  handle: string;
  platform: "instagram" | "tiktok";
  postCount: number;
  isPublished: boolean;
  lastSyncAt: string | null;
  whiteLabelBrand?: string | null;
  whiteLabelUrl?: string | null;
  gridColumns?: 2 | 3;
  bio?: string | null;
  avatarUrl?: string | null;
  accentColor?: string;
};

type SiteContextValue = {
  sites: DashboardSite[];
  selectedSite: DashboardSite | null;
  selectSite: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SiteContext = createContext<SiteContextValue | null>(null);

export function useSiteContext() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteContext must be used inside SiteProvider");
  return ctx;
}

const STORAGE_KEY = "bmd_selected_site_id";

export default function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<DashboardSite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch("/api/sites");
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
      }
    } catch {
      // Network error — keep empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setSelectedId(stored);
    fetchSites();
  }, [fetchSites]);

  // When sites load, pick the first one if nothing's selected (or stored selection no longer exists)
  useEffect(() => {
    if (sites.length === 0) return;
    if (!selectedId || !sites.find((s) => s.id === selectedId)) {
      setSelectedId(sites[0].id);
    }
  }, [sites, selectedId]);

  const selectSite = useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const selectedSite = sites.find((s) => s.id === selectedId) || null;

  return (
    <SiteContext.Provider value={{ sites, selectedSite, selectSite, loading, refresh: fetchSites }}>
      {children}
    </SiteContext.Provider>
  );
}
