import RequestBoard from "@/components/requests/RequestBoard";
import { getSiteData } from "@/lib/demo-data";

export default async function TenantRequestsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const data = await getSiteData(tenant);
  const siteId = data?.siteId || tenant;
  const displayName = data?.site.displayName || tenant.charAt(0).toUpperCase() + tenant.slice(1) + " Directory";

  return <RequestBoard siteId={siteId} siteName={displayName} />;
}
