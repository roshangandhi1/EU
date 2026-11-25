/**
 * The Android app's entry point into @eu/boreholes. Pure: zod and @eu/core/i18n only, no node:*,
 * drizzle or server code, so Metro can bundle it from source.
 */
export * from "./types";
export * from "./validation";
export * from "./maintenance";
export * from "./operational";
export { defaultTemplate, defaultSettings } from "./defaults";
export { strings as boreholesStrings, registerBoreholesStrings } from "./i18n";
