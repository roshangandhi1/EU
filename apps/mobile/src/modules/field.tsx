import { registerBoreholesStrings } from "@eu/boreholes/mobile";
import { registerForestryStrings } from "@eu/forestry/mobile";
import { useEffect, useState, type ReactNode } from "react";
import type { ModuleKey } from "../access";
import type { Session } from "../session";
import { BoreholesHome } from "./boreholes/BoreholesHome";
import { ForestryHome } from "./forestry/ForestryHome";
import { SchoolsApp } from "./schools";

registerForestryStrings();
registerBoreholesStrings();

export type ModuleCounts = Record<ModuleKey, number> & { demo: boolean };

const ENTITY: Record<ModuleKey, { entity: string; code: string }> = {
  schools: { entity: "school.school", code: "code" },
  boreholes: { entity: "boreholes.borehole", code: "code" },
  bamboo: { entity: "bamboo.plot", code: "code" },
  miombo: { entity: "miombo.plot", code: "code" },
};

/**
 * How many schools, boreholes and plots this phone holds, recounted when records change.
 * The server only sends records the person may read, so a count is also a fair test of access.
 */
export function useModuleCounts(session: Session): ModuleCounts | null {
  const [counts, setCounts] = useState<ModuleCounts | null>(null);
  const changes = session.changes;
  useEffect(() => {
    let live = true;
    void (async () => {
      const out = { schools: 0, boreholes: 0, bamboo: 0, miombo: 0, demo: false } as ModuleCounts;
      for (const [key, def] of Object.entries(ENTITY) as [ModuleKey, (typeof ENTITY)[ModuleKey]][]) {
        const rows = (await session.client.list(def.entity)).filter((r) => !r.voidedAt);
        out[key] = rows.length;
        if (rows.some((r) => String(r[def.code] ?? "").startsWith("DEMO"))) out.demo = true;
      }
      if (live) setCounts(out);
    })();
    return () => {
      live = false;
    };
  }, [session, changes]);
  return counts;
}

/** The module's own screens; `close` returns to the home screen. */
export function openModule(key: ModuleKey, session: Session, close: () => void): ReactNode {
  if (key === "schools") return <SchoolsApp session={session} onExit={close} />;
  if (key === "boreholes") return <BoreholesHome session={session} onBack={close} />;
  return <ForestryHome session={session} stream={key} onBack={close} />;
}
