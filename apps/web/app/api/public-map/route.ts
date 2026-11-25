import { NextResponse } from "next/server";
import { latestSnapshots } from "@eu/maps/server";
import { db } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Public, unauthenticated: the latest published snapshot of each layer. */
export async function GET() {
  const layers = await latestSnapshots(db());
  return NextResponse.json({ layers }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
