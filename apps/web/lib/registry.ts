import { PermissionRegistry, platformActions } from "@eu/core";
import { EntityRegistry } from "@eu/sync";

/**
 * The one place modules plug in. Each module exports its ActionMap and entities;
 * add them here, e.g.
 *   permissions.register(schoolsActions); entities.register(...schoolsEntities);
 */
export const permissions = new PermissionRegistry().register(platformActions);
export const entities = new EntityRegistry();
