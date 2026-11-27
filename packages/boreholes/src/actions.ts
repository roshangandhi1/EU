import type { ActionMap } from "@eu/core";

const tech = ["system_admin", "programme_manager", "stream_lead", "field_officer"] as const;
const lead = ["system_admin", "programme_manager", "stream_lead"] as const;

export const boreholeActions = {
  "boreholes.read": { stream: "boreholes", roles: [...tech, "viewer"] },
  "boreholes.write": { stream: "boreholes", roles: [...lead] },
  "boreholes.propose": { stream: "boreholes", roles: [...tech] },
  "boreholes.visit.write": { stream: "boreholes", roles: [...tech] },
  "boreholes.fault.write": { stream: "boreholes", roles: [...tech] },
  "boreholes.population.write": { stream: "boreholes", roles: [...tech] },
  "boreholes.record.void": { stream: "boreholes", roles: [...lead] },
  "boreholes.template.write": { stream: "boreholes", roles: [...lead] },
  "boreholes.settings.write": { stream: "boreholes", roles: ["system_admin", "programme_manager"] },
  /** Which checks count for indicator 1.1.1: system administrators only. */
  "boreholes.criteria.write": { stream: "boreholes", roles: ["system_admin"] },
  "boreholes.publish": { stream: "boreholes", roles: ["system_admin", "programme_manager"] },
} satisfies ActionMap;
