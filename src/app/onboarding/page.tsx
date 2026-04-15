import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingClient from "./OnboardingClient";

/**
 * Onboarding requires an authenticated user — the pipeline that runs at the
 * end of the flow is gated behind auth (it triggers paid services). Free-plan
 * users land here directly from the marketing page, so we redirect them to
 * /login first, preserving the entered handle so they don't have to retype it.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ handle?: string }>;
}) {
  const { handle } = await searchParams;

  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase not configured — treat as unauthenticated
  }

  if (!user) {
    const next = handle
      ? `/onboarding?handle=${encodeURIComponent(handle)}`
      : "/onboarding";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return <OnboardingClient />;
}
