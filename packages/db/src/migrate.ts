import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { fileURLToPath } from "node:url";
import ws from "ws";

// Applies pending migrations. Run during the Vercel build when DATABASE_URL is set.
async function main() {
  const url = process.env.DATABASE_URL;
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
