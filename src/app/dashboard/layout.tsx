import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import DashboardShell from "@/components/dashboard/DashboardShell";

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

  // Look up user's plan from the database
  let userPlan: "free" | "creator" | "pro" | "agency" = "free";
  if (db) {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { plan: true },
    });
    if (dbUser?.plan) {
      userPlan = dbUser.plan as typeof userPlan;
    }
  }

  return (
    <DashboardShell planId={userPlan} userId={user.id} email={user.email || ""}>
      {children}
    </DashboardShell>
  );
}
