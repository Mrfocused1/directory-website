"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Catch-all for password-reset emails.
 *
 * Supabase's recovery email URL has a `redirect_to` parameter we set to
 * /auth/reset, but Supabase only honors it if the URL is in the project's
 * "Redirect URLs" allowlist (Auth → URL Configuration). When it's not,
 * Supabase silently falls back to the Site URL (the bare homepage), so
 * the user lands on / with the recovery hash params attached
 * (`#access_token=…&type=recovery`) and never sees the new-password form.
 *
 * Mounted once at the root layout. The Supabase JS client picks up the
 * hash session on any page that calls createClient(); we listen for the
 * PASSWORD_RECOVERY auth event globally and redirect to /auth/reset, so
 * recovery works regardless of which URL Supabase actually drops the
 * user on.
 *
 * Cheap fallback that doesn't require Supabase dashboard access — once
 * /auth/reset is added to the URL allowlist this becomes a no-op (the
 * direct redirect already lands them in the right place).
 */
export default function RecoverySniffer() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // If we're already on the reset page the page itself handles the
    // hash. Skip to avoid a double-route / loop.
    if (pathname?.startsWith("/auth/reset")) return;

    // Inspect the URL hash synchronously. @supabase/ssr's browser client
    // is PKCE-only and does NOT auto-parse implicit-flow hash tokens, so
    // onAuthStateChange never fires PASSWORD_RECOVERY. Detect the tokens
    // ourselves and forward to /auth/reset with the hash intact — the
    // reset page knows how to setSession() from the hash.
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery") && hash.includes("access_token=")) {
      router.replace(`/auth/reset${hash}`);
      return;
    }

    // Defensive: also subscribe in case a future @supabase/ssr version
    // starts auto-parsing hashes and firing PASSWORD_RECOVERY as documented.
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace(`/auth/reset${window.location.hash || ""}`);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, pathname]);

  return null;
}
