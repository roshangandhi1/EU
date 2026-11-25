import Constants from "expo-constants";

/** Server the phone syncs with. Set per build in app.json → extra.apiBase. */
export const API_BASE: string = (Constants.expoConfig?.extra?.apiBase as string | undefined) ?? "https://eu2-roan.vercel.app";
export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/** How often the app tries to sync while open. */
export const SYNC_INTERVAL_MS = 5 * 60_000;
/** Wrong PINs allowed before an online sign-in is required (unsynced data is kept). */
export const PIN_MAX_FAILURES = 5;
