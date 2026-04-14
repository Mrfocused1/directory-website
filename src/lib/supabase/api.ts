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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email || "" };
}
