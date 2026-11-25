import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { fileURLToPath } from "node:url";
import ws from "ws";

/**
 * Applies pending migrations. Runs during the Vercel build.
 * On Vercel it runs only for production builds: a preview build of an unmerged branch must never
 * apply that branch's migrations to a shared database. Off Vercel (CI, local) it runs whenever
 * DATABASE_URL is set.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") {
    console.log(`VERCEL_ENV=${vercelEnv}; migrations run only on production builds. Skipping.`);
    return;
  }
  if (!url) {
    console.log("DATABASE_URL not set; skipping migrations.");
    return;
  }
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
