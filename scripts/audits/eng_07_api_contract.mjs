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

export async function run() {
  const r = makeReporter("eng_07_api_contract");
  const routes = walk("src/app/api");
  const v1 = routes.filter((f) => f.includes("/api/v1/"));
  r.info("total API routes", `${routes.length}`);
  r.info("v1 (public API) routes", `${v1.length}`);

  let authedV1 = 0;
  for (const f of v1) {
    const src = readFileSync(f, "utf8");
    const authed = /authApiRequest|api-auth|Bearer|key_hash/.test(src);
    if (authed) authedV1++;
  }
  v1.length === 0
    ? r.info("no v1 public API routes yet")
    : authedV1 === v1.length
      ? r.ok(`all ${v1.length} v1 routes have auth references`)
      : r.fail(`${v1.length - authedV1} of ${v1.length} v1 routes lack obvious auth`);

  const emitsJson = routes.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /Response\.json\(|NextResponse\.json\(/.test(src);
  }).length;
  r.info("routes emitting JSON", `${emitsJson}/${routes.length}`);

  const noZodValidation = routes.filter((f) => {
    const src = readFileSync(f, "utf8");
    return !/z\.\w|\.safeParse\(|\.parse\(|zod/.test(src);
  }).length;
  r.info("routes WITHOUT zod/schema validation (heuristic)", `${noZodValidation}/${routes.length}`);
  if (noZodValidation / routes.length > 0.5) r.warn(">50% of routes lack request schema validation");

  return r.summary();
}
