import type { ActionMap, Role } from "./platform";

export type ForestryStream = "bamboo" | "miombo";
export const FORESTRY_STREAMS: ForestryStream[] = ["bamboo", "miombo"];

const field: Role[] = ["system_admin", "programme_manager", "stream_lead", "field_officer"];
const lead: Role[] = ["system_admin", "programme_manager", "stream_lead"];
const manager: Role[] = ["system_admin", "programme_manager"];

/**
 * Bamboo and miombo share tables but are separate streams, so a user can be given one without
 * the other. Every action exists once per stream: "bamboo.visit.write", "miombo.visit.write", ...
 */
const verbs = {
  "plot.read": [...field, "viewer"],
  "plot.write": lead,
  "plot.propose": field,
  "boundary.write": field,
  "boundary.approve": lead,
  "planting.write": field,
  "visit.write": field,
  "record.void": lead,
  "validation.write": field,
  "nursery.write": field,
  "import.run": lead,
  "imagery.manage": lead,
  "settings.write": manager,
  "publish": manager,
} satisfies Record<string, Role[]>;
export type ForestryVerb = keyof typeof verbs;

export const fa = (stream: ForestryStream, verb: ForestryVerb) => `${stream}.${verb}`;

export const forestryActions: ActionMap = Object.fromEntries(
  FORESTRY_STREAMS.flatMap((s) => Object.entries(verbs).map(([v, roles]) => [fa(s, v as ForestryVerb), { stream: s, roles }])),
);
