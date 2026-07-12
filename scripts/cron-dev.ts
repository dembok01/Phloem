// §9 dev helper — hit the local cron route with the bearer token.
//   npm run cron:dev                 → run "today"
//   npm run cron:dev 2026-08-15      → time-travel to that date (dev-only)
// Reads CRON_SECRET + app URL from .env.local.
process.loadEnvFile(".env.local");

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set in .env.local");
    process.exit(1);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const today = process.argv[2];
  if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    console.error(`Bad date "${today}" — expected YYYY-MM-DD`);
    process.exit(1);
  }

  const url = `${base}/api/cron/daily${today ? `?today=${today}` : ""}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } });
  const body = await res.json().catch(() => ({}));
  console.log(`GET ${url} → ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main();
