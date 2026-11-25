import { defineConfig } from "drizzle-kit";

// One migration history for the whole platform. Module packages add their tables in
// packages/<module>/src/db/schema.ts and are picked up here.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "../*/src/db/schema.ts"],
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost/unused" },
});
