import { requireFeature } from "@/lib/require-feature";

export default async function DomainsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("custom_domain");
  return <>{children}</>;
}
