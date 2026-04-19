import { requireFeature } from "@/lib/require-feature";

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("analytics_basic");
  return <>{children}</>;
}
