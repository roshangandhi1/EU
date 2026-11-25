import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@eu/core", "@eu/db", "@eu/sync", "@eu/forestry", "@eu/boreholes", "@eu/maps"],
  serverExternalPackages: ["ws", "@electric-sql/pglite"],
};

export default nextConfig;
