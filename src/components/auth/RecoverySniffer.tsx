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
    // If we're already on the reset page (Supabase honored redirect_to),
    // the page itself handles the event. Skip the sniffer to avoid a
    // double-route / loop.
    if (pathname?.startsWith("/auth/reset")) return;

    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/auth/reset");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, pathname]);

  return null;
}
