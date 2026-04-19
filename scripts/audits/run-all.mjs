import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sql, printResult } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] ?? "";

const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".mjs"))
  .filter((f) => !["lib.mjs", "run-all.mjs"].includes(f))
  .filter((f) => !filter || f.includes(filter))
  .sort();

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  BuildMy.Directory audit — ${files.length} agents`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

const results = [];
for (const f of files) {
  try {
    const mod = await import(join(HERE, f));
    if (typeof mod.run !== "function") {
      console.log(`\n⚠︎ ${f} — no exported run()`);
      continue;
    }
    const r = await mod.run();
    results.push(r);
    printResult(r);
  } catch (err) {
    console.log(`\n✗ ${f} — crashed`);
    console.log(`  ${err.message}`);
    results.push({ name: f, findings: [], errors: 1, warnings: 0, crashed: true });
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  ROLL-UP`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

const totalFail = results.reduce((a, r) => a + r.errors, 0);
const totalWarn = results.reduce((a, r) => a + r.warnings, 0);
const topIssues = results
  .filter((r) => r.errors > 0 || r.warnings > 0)
  .map((r) => `  ${r.errors > 0 ? "✗" : "!"} ${r.name}: ${r.errors} fail / ${r.warnings} warn`)
  .join("\n");

console.log(`\n${results.length} audits ran`);
console.log(`${totalFail} FAIL findings`);
console.log(`${totalWarn} WARN findings`);
if (topIssues) {
  console.log(`\nAudits with findings:\n${topIssues}`);
}

await sql.end();
process.exit(totalFail > 0 ? 1 : 0);
