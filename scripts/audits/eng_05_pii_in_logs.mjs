import { makeReporter } from "./lib.mjs";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist"].includes(f)) continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

const LOG_CALL = /console\.(log|error|warn|info)\s*\(/;

export async function run() {
  const r = makeReporter("eng_05_pii_in_logs");
  const files = walk("src");
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!LOG_CALL.test(line)) continue;
      if (/password|\.email\b|stripe_customer|\bsecret|credit|card_number|\baddress\b/i.test(line)) {
        hits.push({ file: f, line: i + 1, text: line.trim().slice(0, 100) });
      }
    }
  }

  r.info("files scanned", `${files.length}`);
  if (hits.length === 0) r.ok("no obvious PII-leaking log calls");
  else {
    r.warn(`${hits.length} log call(s) with potential PII`, "");
    for (const h of hits.slice(0, 10)) r.warn(`${h.file}:${h.line}`, h.text);
  }

  return r.summary();
}
