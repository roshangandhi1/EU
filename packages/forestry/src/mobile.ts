/**
 * The Android app's entry point into @eu/forestry. Pure: zod and @eu/core/i18n only, no node:*,
 * drizzle, turf, jszip or server code, so Metro can bundle it from source.
 */
export * from "./validation";
export * from "./geo/pip";
export { defaultSettings } from "./defaults";
export { strings as forestryStrings, registerForestryStrings } from "./i18n";
export { fa, FORESTRY_STREAMS, type ForestryStream } from "./actions";
