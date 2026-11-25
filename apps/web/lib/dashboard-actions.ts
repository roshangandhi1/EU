import type { ActionMap } from "@eu/core";

/** Kept apart from lib/dashboard.ts so the registry does not import server loaders. */
export const dashboardActions: ActionMap = {
  "dashboard.read": { stream: "platform", roles: ["system_admin", "programme_manager", "viewer"] },
};
