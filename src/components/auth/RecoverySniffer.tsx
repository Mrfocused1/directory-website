"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Catch-all for Supabase email auth redirects.
 *
 * Supabase email URLs (signup confirm, password recovery, magic link,
 * invite) carry a `redirect_to` parameter. Supabase only honors it if
 * that URL is in the project's "Redirect URLs" allowlist (Auth → URL
 * Configuration). When it isn't, Supabase silently falls back to the
 * Site URL — the bare homepage — and strips or leaves the tokens in
 * the hash fragment. Users land on / unauthenticated.
 *
 * This component runs on every page, detects stray auth tokens in the
 * hash, and forwards to the right page (/auth/reset for recovery,
 * /auth/callback for everything else). Becomes a no-op once the URL
 * allowlist is correctly configured.
 */
export default function RecoverySniffer() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Already on an auth handler — let it do its job
    if (pathname?.startsWith("/auth/reset") || pathname?.startsWith("/auth/callback")) return;

    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const hasTokens = hash.includes("access_token=") || hash.includes("refresh_token=");

    if (hasTokens) {
      const isRecovery = hash.includes("type=recovery");
      router.replace(isRecovery ? `/auth/reset${hash}` : `/auth/callback${hash}`);
      return;
    }

    // Defensive: also subscribe in case a future @supabase/ssr version
    // starts auto-parsing hashes and firing events as documented.
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace(`/auth/reset${window.location.hash || ""}`);
      } else if (event === "SIGNED_IN" && window.location.hash.includes("access_token=")) {
        router.replace(`/auth/callback${window.location.hash}`);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, pathname]);

  return null;
}
