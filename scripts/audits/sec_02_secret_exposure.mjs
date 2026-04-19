import { makeReporter } from "./lib.mjs";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".vercel"]);
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx", ".json", ".md", ".sh"]);

const PATTERNS = [
  { name: "Stripe live key", rx: /sk_live_[A-Za-z0-9]{20,}/g },
  { name: "Stripe restricted key", rx: /rk_live_[A-Za-z0-9]{20,}/g },
  { name: "Anthropic key", rx: /sk-ant-[A-Za-z0-9_-]{30,}/g },
  { name: "OpenAI key", rx: /sk-[A-Za-z0-9]{40,}/g },
  { name: "Resend key", rx: /re_[A-Za-z0-9_]{20,}/g },
  { name: "Apify token", rx: /apify_api_[A-Za-z0-9]{30,}/g },
  { name: "Vercel token", rx: /vercel_blob_rw_[A-Za-z0-9_]{20,}/g },
  { name: "Telegram bot token", rx: /\b\d{9,10}:[A-Za-z0-9_-]{30,}\b/g },
  { name: "JWT", rx: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { name: "Supabase service key prefix", rx: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?eyJ/g },
];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (SKIP_DIRS.has(f) || f.startsWith(".env")) continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else {
      const dot = f.lastIndexOf(".");
      if (dot > 0 && SCAN_EXT.has(f.slice(dot))) out.push(p);
    }
  }
  return out;
}

export async function run() {
  const r = makeReporter("sec_02_secret_exposure");
  const files = walk(".");
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const p of PATTERNS) {
      const matches = src.match(p.rx);
      if (matches) {
        for (const m of matches.slice(0, 2)) hits.push({ file: f, pattern: p.name, sample: m.slice(0, 16) + "…" });
      }
    }
  }

  r.info(`files scanned`, `${files.length}`);
  if (hits.length === 0) r.ok("no secret patterns matched in committed source");
  else {
    r.fail(`${hits.length} potential secret leak${hits.length > 1 ? "s" : ""}`, "");
    for (const h of hits.slice(0, 10)) r.warn(h.pattern, `${h.file} — ${h.sample}`);
  }

  return r.summary();
}
