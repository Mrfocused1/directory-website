import { makeReporter } from "./lib.mjs";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist"].includes(f)) continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

export async function run() {
  const r = makeReporter("eng_04_ts_strictness");
  const files = walk("src");
  r.info("TS files scanned", `${files.length}`);

  let anyHits = 0;
  let expectError = 0;
  let eslintDisable = 0;
  let asAny = 0;
  const byFile = new Map();

  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const a = (src.match(/:\s*any\b/g) || []).length + (src.match(/<any>/g) || []).length;
    const e = (src.match(/@ts-expect-error|@ts-ignore/g) || []).length;
    const l = (src.match(/eslint-disable(?!-next-line)/g) || []).length;
    const aa = (src.match(/as\s+any\b/g) || []).length;
    anyHits += a;
    expectError += e;
    eslintDisable += l;
    asAny += aa;
    const totalHere = a + e + l + aa;
    if (totalHere > 3) byFile.set(f, totalHere);
  }

  r.info(":any usages", `${anyHits}`);
  r.info("as any", `${asAny}`);
  r.info("@ts-expect-error / @ts-ignore", `${expectError}`);
  r.info("eslint-disable (block)", `${eslintDisable}`);

  if (anyHits + asAny + expectError + eslintDisable < 20) r.ok("strictness debt low");
  else r.warn("strictness debt accumulating");

  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [f, n] of worst) r.warn(`${f}`, `${n} escape hatches`);

  return r.summary();
}
