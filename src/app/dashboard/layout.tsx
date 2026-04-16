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

  // Look up user's plan from the database. If the row doesn't exist
  // (e.g. pre-existing Supabase user), create it on the fly.
  const validPlans: Array<"free" | "creator" | "pro" | "agency"> = ["free", "creator", "pro", "agency"];
  let userPlan: "free" | "creator" | "pro" | "agency" = "free";
  if (db) {
    let dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { plan: true },
    });
    if (!dbUser) {
      try {
        await db.insert(users).values({
          id: user.id,
          email: user.email || `${user.id}@placeholder.local`,
          plan: "free",
        }).onConflictDoNothing();
        dbUser = { plan: "free" };
      } catch (err) {
        console.error("[dashboard] Failed to backfill users row:", err);
      }
    }
    if (dbUser?.plan && validPlans.includes(dbUser.plan as typeof userPlan)) {
      userPlan = dbUser.plan as typeof userPlan;
    }
  }

  return (
    <DashboardShell planId={userPlan} userId={user.id} email={user.email || ""}>
      {children}
    </DashboardShell>
  );
}
