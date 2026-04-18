import { runAllChecks } from "@/lib/monitor/checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runAllChecks();
  return Response.json(report, { status: report.overall === "down" ? 503 : 200 });
}
