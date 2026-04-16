import { notFound } from "next/navigation";
import RequestBoard from "@/components/requests/RequestBoard";
import { getSiteData } from "@/lib/demo-data";

export default async function TenantRequestsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  if (!data) notFound();
  if (!data.features?.requests) notFound();

  return <RequestBoard siteId={data.siteId} siteName={data.site.displayName} />;
}
