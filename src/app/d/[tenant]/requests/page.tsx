import RequestBoard from "@/components/requests/RequestBoard";

export default async function TenantRequestsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const displayName = tenant.charAt(0).toUpperCase() + tenant.slice(1) + " Directory";

  return <RequestBoard siteId={tenant} siteName={displayName} />;
}
