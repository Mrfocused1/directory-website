import { makeReporter } from "./lib.mjs";
import { readFileSync } from "fs";

function parseEnvKeys(path) {
  try {
    const src = readFileSync(path, "utf8");
    return new Set(
      src
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.match(/^[A-Z_][A-Z0-9_]*=/))
        .map((l) => l.split("=")[0]),
    );
  } catch {
    return null;
  }
}

export async function run() {
  const r = makeReporter("eng_03_env_drift");

  const example = parseEnvKeys(".env.example");
  const local = parseEnvKeys(".env.local");
  if (!example) return r.fail(".env.example missing"), r.summary();
  if (!local) return r.warn(".env.local missing (dev only)"), r.summary();

  r.info(".env.example keys", `${example.size}`);
  r.info(".env.local keys", `${local.size}`);

  const missingLocal = [...example].filter((k) => !local.has(k));
  const extraLocal = [...local].filter((k) => !example.has(k));

  if (missingLocal.length === 0) r.ok("every .env.example key is in .env.local");
  else {
    r.warn(`${missingLocal.length} key(s) in .env.example but not in .env.local`, "");
    for (const k of missingLocal.slice(0, 10)) r.warn("missing locally", k);
  }

  if (extraLocal.length === 0) r.ok(".env.local has no undocumented keys");
  else {
    r.warn(`${extraLocal.length} key(s) in .env.local but not in .env.example`, "document them");
    for (const k of extraLocal.slice(0, 10)) r.warn("undocumented", k);
  }

  return r.summary();
}
