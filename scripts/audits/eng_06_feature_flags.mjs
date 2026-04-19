import { sql, makeReporter } from "./lib.mjs";
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

export async function run() {
  const r = makeReporter("eng_06_feature_flags");

  // grep features?.<flag> usage in source
  const src = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  const codeFlags = new Set(
    [...src.matchAll(/features[?]?\.([a-zA-Z_][a-zA-Z0-9_]+)/g)].map((m) => m[1]),
  );
  r.info("flags referenced in code", `${codeFlags.size}`);
  for (const f of codeFlags) r.info("code-referenced flag", f);

  // flags from 'white_label_*' columns and plans
  const plans = await sql`SELECT DISTINCT plan FROM users`;
  r.info("plans in DB", plans.map((p) => p.plan).join(", "));

  // any TODO / FIXME around flags in src
  const todos = [...src.matchAll(/\/\/\s*(TODO|FIXME|XXX|HACK):?[^\n]*/g)].map((m) => m[0].slice(0, 100));
  r.info("TODO/FIXME comments", `${todos.length}`);
  if (todos.length > 50) r.warn(`>50 TODO comments`, "accumulated debt");

  return r.summary();
}
