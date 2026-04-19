"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * /auth/callback
 *
 * Handles Supabase email confirmation + OAuth redirects.
 *
 * Supabase can redirect here in two ways:
 *   1. PKCE flow: ?code=xxx  (server-exchangeable)
 *   2. Implicit/email flow: #access_token=xxx&refresh_token=xxx
 *
 * A server route.ts can only handle (1). Hash fragments never reach
 * the server. This client page handles both.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CallbackHandler />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-neutral-500">Signing you in...</p>
      </div>
    </div>
  );
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const supabase = createClient();

    // Validate redirect target
    const nextRaw = searchParams.get("next") ?? "/dashboard";
    const next = (nextRaw.startsWith("/") && !nextRaw.startsWith("//")) ? nextRaw : "/dashboard";

    async function handleCallback() {
      // ── Flow 1: PKCE code in query params ──
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          await ensureUserRow(supabase);
          window.location.href = next;
          return;
        }
        console.error("[auth/callback] Code exchange failed:", error.message);
      }

      // ── Flow 2: Hash fragment (implicit flow / email confirm) ──
      // Supabase client auto-detects hash tokens on init. Just check
      // if a session was established.
      const hash = window.location.hash;
      if (hash && (hash.includes("access_token") || hash.includes("refresh_token"))) {
        // Give Supabase client a moment to process the hash
        await new Promise((r) => setTimeout(r, 500));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await ensureUserRow(supabase);
          window.location.href = next;
          return;
        }
      }

      // ── Flow 2b: Supabase responded with an error in the hash ──
      // Typical cause: Gmail/Outlook's link-preview bot prefetched the
      // confirm URL, consuming the one-time token. By the time the
      // human clicks, Supabase returns otp_expired. The user's email
      // IS confirmed (bot's GET verified it) — they just need to log
      // in normally. Send them to login with a clear message.
      if (hash && hash.includes("error=")) {
        const errCode = new URLSearchParams(hash.slice(1)).get("error_code") || "";
        if (errCode === "otp_expired") {
          window.location.href = "/login?confirmed=1";
          return;
        }
        window.location.href = "/login?error=auth";
        return;
      }

      // ── Flow 3: No code or hash — check if already logged in ──
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        window.location.href = next;
        return;
      }

      // Nothing worked — send to login
      window.location.href = "/login?error=auth";
    }

    async function ensureUserRow(supabase: ReturnType<typeof createClient>) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // Ping a lightweight endpoint to ensure the DB row exists.
        // The server-side /api/auth/me will create it if needed.
        await fetch("/api/auth/me", { method: "POST" }).catch(() => {});
      } catch {
        // Non-critical — dashboard will handle missing row
      }
    }

    handleCallback();
  }, [searchParams, router]);

  return <Loading />;
}
