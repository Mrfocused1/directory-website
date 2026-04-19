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
  const r = makeReporter("media_02_dead_tables");

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  r.info("public tables", `${tables.length}`);

  const src = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  const schemaSrc = readFileSync("src/db/schema.ts", "utf8");

  const orphans = [];
  const SKIP = new Set(["stripe_events", "admin_audit_log"]);

  for (const t of tables) {
    if (SKIP.has(t.table_name)) continue;
    // camelCase variant for drizzle: snake_case -> camelCase
    const camel = t.table_name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const referencedInSchema = schemaSrc.includes(`"${t.table_name}"`) || schemaSrc.includes(camel);
    const referencedInCode = src.includes(camel) || src.includes(`"${t.table_name}"`);
    if (!referencedInSchema && !referencedInCode) {
      orphans.push(t.table_name);
    }
  }

  if (orphans.length === 0) r.ok("every DB table is referenced in schema or code");
  else {
    r.warn(`${orphans.length} DB table(s) not referenced anywhere in code`, "candidates for drop");
    for (const o of orphans) r.warn("orphan table", o);
  }

  const rowCountForOrphans = [];
  for (const t of orphans) {
    try {
      const [res] = await sql.unsafe(`SELECT COUNT(*)::int as n FROM "${t}"`);
      rowCountForOrphans.push({ t, n: res.n });
    } catch {}
  }
  for (const o of rowCountForOrphans) r.info(o.t, `${o.n} rows`);

  return r.summary();
}
