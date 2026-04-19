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

const EXEMPT = [
  "/api/webhooks/stripe",
  "/api/inngest",
  "/api/health",
  "/api/auth/me",
  "/api/auth/is-admin",
  "/api/advertising/stripe/status",
  "/api/advertising/serve",
  "/api/advertising/impression",
  "/api/advertising/click",
];

export async function run() {
  const r = makeReporter("sec_01_rate_limits");
  const routes = walk("src/app/api");
  const byMethod = { GET: [], POST: [], PUT: [], PATCH: [], DELETE: [] };
  const unlimited = [];

  for (const file of routes) {
    const src = readFileSync(file, "utf8");
    const exported = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g;
    const methods = [...src.matchAll(exported)].map((m) => m[1]);
    const hasLimiter = /checkRateLimit\s*\(|Limiter\.limit\(|apiLimiter|authLimiter|emailLimiter|ad[A-Z]\w*Limiter|siteSyncLimiter/.test(src);
    const apiPath = file
      .replace("src/app", "")
      .replace("/route.ts", "")
      .replace(/\/\[(\w+)\]/g, "/[$1]");
    for (const m of methods) byMethod[m].push(apiPath);
    if (!hasLimiter && methods.length > 0 && !EXEMPT.includes(apiPath)) {
      unlimited.push({ path: apiPath, methods: methods.join(",") });
    }
  }

  r.info(`total API routes`, `${routes.length}`);
  r.info(`by method`, `GET=${byMethod.GET.length} POST=${byMethod.POST.length} PUT=${byMethod.PUT.length} PATCH=${byMethod.PATCH.length} DELETE=${byMethod.DELETE.length}`);

  if (unlimited.length === 0) r.ok("every non-exempt route has a rate limiter");
  else {
    r.fail(`${unlimited.length} non-exempt routes without rate limit`, "");
    for (const u of unlimited) r.warn(`unlimited ${u.methods}`, u.path);
  }

  return r.summary();
}
