import * as Location from "expo-location";
import { useCallback, useRef, useState } from "react";
import { programmeToday } from "../time";

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

/** Why there is no fix: the person said no, location is switched off, or no signal in time. */
export type NoFix = "denied" | "off" | null;

/** One GPS fix, "denied" if the user said no, "off" if location services are off. Uses the last known fix when a new one times out. */
export async function getFix(): Promise<Fix | "denied" | "off" | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return "denied";
  const on = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!on) return "off";
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000));
  const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  const pos = (await Promise.race([fresh, timeout])) ?? (await Location.getLastKnownPositionAsync().catch(() => null));
  if (!pos) return null;
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null };
}

/** The i18n key explaining a missing fix. */
export function noFixKey(why: NoFix): string {
  return why === "denied" ? "forestry.m.gps_denied" : why === "off" ? "ux.gpsOff" : "forestry.m.gps_none";
}

/**
 * A GPS fix for a form: `locate()` asks once (repeated taps while it runs are ignored),
 * `locating` is true meanwhile, and `problem` says why there is no fix.
 */
export function useGps(initial: Fix | null = null) {
  const [fix, setFix] = useState<Fix | null>(initial);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<NoFix | undefined>(undefined);
  const running = useRef(false);
  /** Resolves with the fix, or why there is none ("busy" when a request is already running). */
  const locate = useCallback(async (): Promise<Fix | NoFix | "busy"> => {
    if (running.current) return "busy";
    running.current = true;
    setLocating(true);
    try {
      const f = await getFix();
      if (f === "denied" || f === "off" || f === null) {
        setProblem(f);
        return f;
      }
      setFix(f);
      setProblem(undefined);
      return f;
    } catch {
      setProblem(null);
      return null;
    } finally {
      running.current = false;
      setLocating(false);
    }
  }, []);
  return { fix, setFix, locating, problem, locate };
}

/** The programme's "today" (Haut-Lomami, UTC+2), used for every date default and limit. */
export const localToday = programmeToday;
