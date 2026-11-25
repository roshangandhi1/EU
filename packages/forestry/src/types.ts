/** Plain record shapes shared by the database schema, the server and the phone (no Drizzle here). */
export type PlantingLine = { species: string; count: number; batchId?: string; natural?: false };

export type SampleCount = {
  species: string;
  alive: number;
  dead: number;
  /** Miombo: natural regenerants counted separately from planted stock. */
  naturalAlive?: number;
  heightClass?: "lt50cm" | "50_150cm" | "150_300cm" | "gt300cm";
};

export type SamplePlot = {
  /** Index of the app-generated point for this visit, so the same draw can be reproduced. */
  pointIndex: number;
  lat: number;
  lng: number;
  gpsAccuracyM?: number;
  radiusM: number;
  counts: SampleCount[];
  skipped?: "inaccessible" | "flooded" | "other";
};
