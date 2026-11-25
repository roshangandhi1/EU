import { PermissionRegistry, platformActions } from "@eu/core";
import { EntityRegistry } from "@eu/sync";
import { boreholeActions, boreholeEntities, registerBoreholesStrings } from "@eu/boreholes";
import { forestryActions, forestryEntities, registerForestryStrings } from "@eu/forestry";

/**
 * The one place modules plug in. Each module exports its ActionMap and entities;
 * add them here, e.g.
 *   permissions.register(schoolsActions); entities.register(...schoolsEntities);
 */
export const permissions = new PermissionRegistry()
  .register(platformActions)
  .register(forestryActions)
  .register(boreholeActions);

export const entities = new EntityRegistry()
  .register(...forestryEntities)
  .register(...boreholeEntities);

registerForestryStrings();
registerBoreholesStrings();
