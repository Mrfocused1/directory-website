// shared helpers for ad tracking

export function getSessionId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  const key = "ad_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function fireImpression(adId: string, path: string): Promise<void> {
  const sessionId = getSessionId();
  await fetch("/api/advertising/impression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, path, sessionId }),
  }).catch(() => {});
}

export async function fireClick(adId: string): Promise<string | null> {
  const sessionId = getSessionId();
  const res = await fetch("/api/advertising/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, sessionId }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.clickUrl ?? null;
}

export interface ServedAd {
  id: string;
  slotType: string;
  assetType: "video" | "image";
  assetUrl: string | null;
  clickUrl: string | null;
  headline: string | null;
  body: string | null;
}

export async function fetchAd(siteId: string, slotType: string): Promise<ServedAd | null> {
  const res = await fetch(
    `/api/advertising/serve?siteId=${encodeURIComponent(siteId)}&slotType=${encodeURIComponent(slotType)}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.ad ?? null;
}
