import { en, type Dictionary } from "./en";
import { fr } from "./fr";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fr";
}

type Tree = { [key: string]: string | Tree };

const base: Record<Locale, Tree> = { en: en as unknown as Tree, fr: fr as unknown as Tree };
const extra: Record<Locale, Record<string, Tree>> = { en: {}, fr: {} };

/**
 * Modules add their strings under their own namespace, e.g.
 * registerNamespace("schools", { en: schoolsEn, fr: schoolsFr }).
 * The French and English trees must have the same keys.
 */
export function registerNamespace(ns: string, dicts: Record<Locale, Tree>): void {
  if (ns in (base.en as object)) throw new Error(`Namespace clashes with platform strings: ${ns}`);
  const missing = diffKeys(dicts.en, dicts.fr);
  if (missing.length) throw new Error(`Namespace ${ns}: keys missing in one language: ${missing.join(", ")}`);
  extra.en[ns] = dicts.en;
  extra.fr[ns] = dicts.fr;
}

export function diffKeys(a: Tree, b: Tree, prefix = ""): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    const path = prefix ? `${prefix}.${k}` : k;
    if (va === undefined || vb === undefined) out.push(path);
    else if (typeof va === "object" && typeof vb === "object") out.push(...diffKeys(va, vb, path));
    else if (typeof va !== typeof vb) out.push(path);
  }
  return out;
}

/**
 * Translate a dotted key ("sync.waiting") with {placeholders}.
 * Falls back to English, then to the key itself, so a missing string never crashes a screen.
 */
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(locale, key) ?? lookup("en", key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function lookup(locale: Locale, key: string): string | undefined {
  const [head, ...rest] = key.split(".");
  if (!head) return undefined;
  let node: string | Tree | undefined = (base[locale] as Tree)[head] ?? extra[locale][head];
  for (const part of rest) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export { en, fr };
export type { Dictionary };
