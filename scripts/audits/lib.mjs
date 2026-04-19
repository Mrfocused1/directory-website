import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

export const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 2 });
export { env };

export function makeReporter(name) {
  const findings = [];
  let warnings = 0;
  let errors = 0;
  return {
    ok: (label) => findings.push({ level: "ok", label }),
    warn: (label, detail) => {
      warnings++;
      findings.push({ level: "warn", label, detail });
    },
    fail: (label, detail) => {
      errors++;
      findings.push({ level: "fail", label, detail });
    },
    info: (label, detail) => findings.push({ level: "info", label, detail }),
    summary: () => ({ name, findings, warnings, errors }),
  };
}

export function printResult(result) {
  const icon = result.errors > 0 ? "✗" : result.warnings > 0 ? "!" : "✓";
  console.log(`\n${icon} ${result.name}  (${result.errors} fail, ${result.warnings} warn)`);
  for (const f of result.findings) {
    const p = f.level === "fail" ? "  ✗" : f.level === "warn" ? "  !" : f.level === "ok" ? "  ·" : "  ℹ";
    const detail = f.detail ? `  — ${f.detail}` : "";
    console.log(`${p} ${f.label}${detail}`);
  }
}

export function readRepo(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

export function cents(n) {
  return `$${(n / 100).toFixed(2)}`;
}
