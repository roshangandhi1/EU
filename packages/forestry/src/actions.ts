import type { ActionMap } from "./platform";

const both = ["bamboo", "miombo"] as const;
const field = ["system_admin", "programme_manager", "stream_lead", "field_officer"] as const;
const lead = ["system_admin", "programme_manager", "stream_lead"] as const;
const all = [...field, "viewer"] as const;

export const forestryActions = {
  "forestry.plot.read": { stream: [...both], roles: [...all] },
  "forestry.plot.write": { stream: [...both], roles: [...lead] },
  "forestry.plot.propose": { stream: [...both], roles: [...field] },
  "forestry.boundary.write": { stream: [...both], roles: [...field] },
  "forestry.boundary.approve": { stream: [...both], roles: [...lead] },
  "forestry.planting.write": { stream: [...both], roles: [...field] },
  "forestry.visit.write": { stream: [...both], roles: [...field] },
  "forestry.record.void": { stream: [...both], roles: [...lead] },
  "forestry.validation.write": { stream: [...both], roles: [...field] },
  "forestry.nursery.write": { stream: [...both], roles: [...field] },
  "forestry.import.run": { stream: [...both], roles: [...lead] },
  "forestry.imagery.manage": { stream: [...both], roles: [...lead] },
  "forestry.settings.write": { stream: [...both], roles: ["system_admin", "programme_manager"] },
  "forestry.publish": { stream: [...both], roles: ["system_admin", "programme_manager"] },
} satisfies ActionMap;
