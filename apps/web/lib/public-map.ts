import type { UserContext } from "@eu/core";
import { buildPublicLayer as boreholeLayer, PUBLIC_BOREHOLE_PROPS } from "@eu/boreholes/server";
import { buildPublicLayer as forestryLayer, PUBLIC_PLOT_PROPS } from "@eu/forestry/server";
import { publishSnapshot, type PublicLayer } from "@eu/maps/server";
import { db } from "./http";
import { todayDrc } from "./dates";
import { permissions } from "./registry";

export const publishAction = (layer: PublicLayer) => `${layer}.publish`;

export function canPublish(user: UserContext, layer: PublicLayer): boolean {
  return permissions.can(user, publishAction(layer), { stream: layer });
}

/** Build the layer from live records (public, approved, generalised) and store it as a snapshot. */
export async function publishLayer(user: UserContext, layer: PublicLayer) {
  if (!canPublish(user, layer)) return { ok: false as const, reason: "forbidden" };
  const asAt = todayDrc();
  const built = layer === "boreholes" ? await boreholeLayer(db(), asAt) : await forestryLayer(db(), layer, asAt);
  const allowed = layer === "boreholes" ? PUBLIC_BOREHOLE_PROPS : PUBLIC_PLOT_PROPS;
  const r = await publishSnapshot(db(), { layer, userId: user.id, asAt, data: built.data, summary: built.summary, allowed });
  return { ok: true as const, ...r, summary: built.summary };
}
