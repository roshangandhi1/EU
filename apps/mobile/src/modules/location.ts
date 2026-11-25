import * as Location from "expo-location";

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

/** One GPS fix, or "denied" if the user said no. Uses the last known fix when a new one times out. */
export async function getFix(): Promise<Fix | "denied" | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return "denied";
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000));
  const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  const pos = (await Promise.race([fresh, timeout])) ?? (await Location.getLastKnownPositionAsync().catch(() => null));
  if (!pos) return null;
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null };
}

/** The phone's own calendar date: what the planter means by "today". */
export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
