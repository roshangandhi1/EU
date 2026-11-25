import { registerNamespace } from "@eu/core/i18n";
import { en } from "./en";
import { fr } from "./fr";

type Tree = { [k: string]: string | Tree };

/** Flat "forestry.a.b" keys -> nested tree under the "forestry" namespace, as @eu/core/i18n expects. */
export function nest(flat: Record<string, string>, ns: string): Tree {
  const root: Tree = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.startsWith(ns + ".")) throw new Error(`String key outside namespace ${ns}: ${key}`);
    const parts = key.slice(ns.length + 1).split(".");
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        if (part in node) throw new Error(`Duplicate or clashing string key: ${key}`);
        node[part] = value;
      } else {
        const next = node[part] ?? {};
        if (typeof next === "string") throw new Error(`String key is both a leaf and a branch: ${key}`);
        node = node[part] = next;
      }
    });
  }
  return root;
}

export const strings = { en: nest(en, "forestry"), fr: nest(fr, "forestry") };

export function registerForestryStrings() {
  registerNamespace("forestry", strings);
}
