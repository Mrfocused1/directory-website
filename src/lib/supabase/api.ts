import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Get the authenticated user ID from the request cookies.
 * For use in API route handlers.
 * Returns null if not authenticated.
 */
export async function getApiUser(): Promise<{ id: string; email: string } | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // API routes don't need to set cookies
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Silent return previously meant a transient Supabase error looked
    // identical to "no session" — which could leak anonymous access if
    // upstream defaults trust the return value. Log so Sentry sees it
    // and return null explicitly.
    console.warn("[getApiUser] auth.getUser failed:", error.message);
    return null;
  }
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email || "" };
}
