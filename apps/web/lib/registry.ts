import { PermissionRegistry, platformActions } from "@eu/core";
import { registerNamespace } from "@eu/core/i18n";
import { schoolsActions, schoolsEn, schoolsEntities, schoolsFr } from "@eu/schools";
import { EntityRegistry } from "@eu/sync";
import { boreholeActions, boreholeEntities, registerBoreholesStrings } from "@eu/boreholes";
import { forestryActions, forestryEntities, registerForestryStrings } from "@eu/forestry";
import { publicMapStrings } from "@eu/maps";
import { dashboardActions } from "./dashboard-actions";
import { dashboardStrings } from "./dashboard-strings";

/**
 * The one place modules plug in. Each module exports its ActionMap and entities;
 * add them here, e.g.
 *   permissions.register(schoolsActions); entities.register(...schoolsEntities);
 */
export const permissions = new PermissionRegistry()
  .register(platformActions)
  .register(schoolsActions)
  .register(forestryActions)
  .register(boreholeActions)
  .register(dashboardActions);

export const entities = new EntityRegistry()
  .register(...schoolsEntities)
  .register(...forestryEntities)
  .register(...boreholeEntities);

registerNamespace("schools", { en: schoolsEn, fr: schoolsFr });
registerForestryStrings();
registerBoreholesStrings();
registerNamespace("publicmap", publicMapStrings);
registerNamespace("dashboard", dashboardStrings);
