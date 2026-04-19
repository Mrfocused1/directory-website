import { makeReporter } from "./lib.mjs";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f === "route.ts") out.push(p);
  }
  return out;
}

function loadAllTsSource() {
  const chunks = [];
  function w(d) {
    for (const f of readdirSync(d)) {
      if (["node_modules", ".next", ".git", "dist"].includes(f)) continue;
      const p = join(d, f);
      const s = statSync(p);
      if (s.isDirectory()) w(p);
      else if (/\.(ts|tsx|js|mjs|jsx)$/.test(f) && !p.endsWith("route.ts")) {
        try { chunks.push(readFileSync(p, "utf8")); } catch {}
      }
    }
  }
  w("src");
  w("scripts");
  return chunks.join("\n");
}

export async function run() {
  const r = makeReporter("eng_02_dead_routes");
  const routes = walk("src/app/api");
  const src = loadAllTsSource();

  const dead = [];
  for (const file of routes) {
    const apiPath = file.replace("src/app", "").replace("/route.ts", "");
    // Dynamic segments convert to regex-ish pattern
    const base = apiPath.replace(/\/\[\w+\]/g, "").split("/").filter(Boolean);
    // Check if any mention of this path exists anywhere
    const pathLit = apiPath.replace(/\/\[\w+\]/g, "");
    const referenced = src.includes(pathLit) || (base.length > 0 && src.includes(`/${base[base.length - 1]}`));
    if (!referenced) dead.push(apiPath);
  }

  r.info("API routes", `${routes.length}`);
  if (dead.length === 0) r.ok("every API route appears to be referenced from client code or tests");
  else {
    r.warn(`${dead.length} route(s) not obviously referenced in-repo`, "check webhook/external-consumer usage");
    for (const d of dead.slice(0, 15)) r.warn("unreferenced", d);
  }

  return r.summary();
}
