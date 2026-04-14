import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Get the currently authenticated user. Returns null if not signed in.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Require authentication. Redirects to /login if not signed in.
 * Use in server components and API routes.
 */
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
