import { makeReporter } from "./lib.mjs";
import { execSync } from "child_process";

export async function run() {
  const r = makeReporter("eng_01_npm_audit");
  try {
    const out = execSync("npm audit --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const data = JSON.parse(out);
    const v = data.metadata?.vulnerabilities ?? {};
    r.info("dependencies scanned", `${data.metadata?.totalDependencies ?? "?"}`);
    r.info(`critical`, `${v.critical ?? 0}`);
    r.info(`high`, `${v.high ?? 0}`);
    r.info(`moderate`, `${v.moderate ?? 0}`);
    r.info(`low`, `${v.low ?? 0}`);
    if ((v.critical ?? 0) > 0) r.fail(`${v.critical} critical vulnerabilities`);
    else if ((v.high ?? 0) > 0) r.fail(`${v.high} high vulnerabilities`);
    else if ((v.moderate ?? 0) > 0) r.warn(`${v.moderate} moderate vulnerabilities`);
    else r.ok("no critical/high/moderate vulns");
  } catch (err) {
    if (err.stdout) {
      try {
        const data = JSON.parse(err.stdout.toString());
        const v = data.metadata?.vulnerabilities ?? {};
        r.info(`critical`, `${v.critical ?? 0}`);
        r.info(`high`, `${v.high ?? 0}`);
        r.info(`moderate`, `${v.moderate ?? 0}`);
        r.info(`low`, `${v.low ?? 0}`);
        if ((v.critical ?? 0) > 0) r.fail(`${v.critical} critical vulnerabilities`);
        else if ((v.high ?? 0) > 0) r.fail(`${v.high} high vulnerabilities`);
        else if ((v.moderate ?? 0) > 0) r.warn(`${v.moderate} moderate vulnerabilities`);
        else r.ok("no critical/high/moderate vulns");
      } catch {
        r.warn("npm audit produced non-JSON output");
      }
    } else {
      r.warn("npm audit failed", err.message?.slice(0, 80));
    }
  }
  return r.summary();
}
