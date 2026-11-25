import { PermissionRegistry, platformActions } from "@eu/core";
import { registerNamespace } from "@eu/core/i18n";
import { schoolsActions, schoolsEn, schoolsEntities, schoolsFr } from "@eu/schools";
import { EntityRegistry } from "@eu/sync";

/**
 * The one place modules plug in. Each module exports its ActionMap and entities;
 * add them here, e.g.
 *   permissions.register(schoolsActions); entities.register(...schoolsEntities);
 */
export const permissions = new PermissionRegistry().register(platformActions).register(schoolsActions);
export const entities = new EntityRegistry().register(...schoolsEntities);

registerNamespace("schools", { en: schoolsEn, fr: schoolsFr });
