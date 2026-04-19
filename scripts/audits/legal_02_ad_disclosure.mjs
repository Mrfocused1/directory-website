import { makeReporter } from "./lib.mjs";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const AD_DIR = "src/components/advertising";

export async function run() {
  const r = makeReporter("legal_02_ad_disclosure");

  let files;
  try {
    files = readdirSync(AD_DIR).filter((f) => f.endsWith(".tsx") && /Ad\.tsx$/.test(f));
  } catch {
    r.fail(`${AD_DIR} not found`);
    return r.summary();
  }

  r.info("ad renderer components", `${files.length}`);

  const failing = [];
  const warning = [];
  for (const f of files) {
    const src = readFileSync(join(AD_DIR, f), "utf8");
    const hasLabel = /^\s*(Ad|Sponsored)\s*$/m.test(src) || /"\s*(Ad|Sponsored)\s*"/.test(src);
    const firesClick = /fireClick\(/.test(src);
    const firesImpression = /fireImpression\(/.test(src);
    const opensBlank = /_blank/.test(src);

    const problems = [];
    if (!hasLabel) problems.push("no 'Ad'/'Sponsored' label");
    if (!firesImpression) problems.push("no impression firing");
    if (!firesClick) problems.push("no click firing");
    if (!opensBlank) warning.push(`${f}: doesn't open click in _blank`);

    if (problems.length > 0) failing.push({ f, problems });
  }

  if (failing.length === 0) r.ok(`every ad renderer has disclosure label + tracking`);
  else {
    r.fail(`${failing.length} ad renderer(s) missing required disclosure/tracking`);
    for (const x of failing) r.fail(x.f, x.problems.join(", "));
  }

  for (const w of warning) r.warn(w);

  return r.summary();
}
