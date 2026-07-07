/**
 * §16 runner — executes supabase/tests/rls.test.sql against the database.
 * Needs a direct Postgres connection string in SUPABASE_DB_URL (.env.local);
 * without one (environment override: hosted project, no local stack), run the
 * same file via the Supabase MCP `execute_sql` tool instead.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

process.loadEnvFile(".env.local");

const sqlPath = path.join(process.cwd(), "supabase", "tests", "rls.test.sql");
const sql = readFileSync(sqlPath, "utf8");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "SUPABASE_DB_URL is not set. Add a direct Postgres connection string to .env.local,\n" +
      "or run supabase/tests/rls.test.sql through the Supabase MCP execute_sql tool.",
  );
  process.exit(2);
}

const client = new Client({ connectionString: dbUrl });
try {
  await client.connect();
  const results = await client.query(sql);
  const rows = (Array.isArray(results) ? results : [results])
    .flatMap((r) => r.rows ?? [])
    .flatMap((row) => Object.values(row) as string[]);
  for (const line of rows) console.log(line);
  console.log("§16 RLS suite: PASS");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  console.error("§16 RLS suite: FAIL");
  process.exit(1);
} finally {
  await client.end();
}
