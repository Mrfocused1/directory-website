import { requireFeature } from "@/lib/require-feature";

export default async function NewsletterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("newsletter");
  return <>{children}</>;
}
