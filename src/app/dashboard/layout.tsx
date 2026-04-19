import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase not configured — redirect to login
  }

  if (!user) {
    redirect("/login");
  }

  // Look up user's plan + subscription status. If the row doesn't exist
  // (e.g. pre-existing Supabase user), create it on the fly.
  // "free" remains in the union for backward compatibility with
  // grandfathered DB rows but new rows always default to "creator".
  type Plan = "free" | "creator" | "pro" | "agency";
  const validPlans: Plan[] = ["creator", "pro", "agency", "free"];
  let userPlan: Plan = "creator";
  let subscriptionStatus: string | null = null;
  if (db) {
    let dbUser: { plan: string; subscriptionStatus: string | null } | undefined =
      await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { plan: true, subscriptionStatus: true },
      });
    if (!dbUser) {
      try {
        await db.insert(users).values({
          id: user.id,
          email: user.email || `${user.id}@placeholder.local`,
          plan: "creator",
        }).onConflictDoNothing();
        dbUser = { plan: "creator", subscriptionStatus: null };
      } catch (err) {
        console.error("[dashboard] Failed to backfill users row:", err);
      }
    }
    if (dbUser?.plan && validPlans.includes(dbUser.plan as Plan)) {
      userPlan = dbUser.plan as Plan;
    }
    subscriptionStatus = dbUser?.subscriptionStatus ?? null;
  }

  // Paywall: anyone who isn't actively subscribed gets routed through
  // checkout before they can see the dashboard. Legacy "free" rows are
  // exempt — their existing directories stay viewable but they can't
  // do anything new.
  if (userPlan !== "free" && subscriptionStatus !== "active") {
    redirect("/checkout-redirect?plan=creator");
  }

  return (
    <DashboardShell planId={userPlan} userId={user.id} email={user.email || ""}>
      {children}
    </DashboardShell>
  );
}
