import type { MaintenanceTaskDef } from "./db/schema";

/** Starting template from the scope doc. Stream leads edit it on the web; nothing here is hard-coded behaviour. */
export const defaultTemplate: { templateKey: string; name: { en: string; fr: string }; tasks: MaintenanceTaskDef[] } = {
  templateKey: "routine",
  name: { en: "Routine maintenance", fr: "Entretien courant" },
  tasks: [
    { key: "panels_clean", label: { en: "Clean solar panels", fr: "Nettoyer les panneaux solaires" },
      frequency: { kind: "each_visit" }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: false },
    { key: "leaks_check", label: { en: "Check for leaks", fr: "Vérifier les fuites" },
      frequency: { kind: "each_visit" }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: true },
    { key: "flow_measure", label: { en: "Measure flow (bucket and stopwatch)", fr: "Mesurer le débit (seau et chronomètre)" },
      frequency: { kind: "every_n_months", n: 1, day: 1 }, appliesTo: { all: true }, proof: { kind: "reading", unit: "L/min", min: 1 }, failOpensFault: true },
    { key: "taps_fittings", label: { en: "Check taps and fittings", fr: "Vérifier robinets et raccords" },
      frequency: { kind: "every_n_months", n: 1, day: 1 }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: true },
    { key: "pump_controller_wiring", label: { en: "Check pump, controller and wiring", fr: "Vérifier pompe, contrôleur et câblage" },
      frequency: { kind: "every_n_months", n: 3, day: 1 }, appliesTo: { all: true }, proof: { kind: "photo" }, failOpensFault: true },
    { key: "tank_disinfect", label: { en: "Clean and disinfect the tank", fr: "Nettoyer et désinfecter le réservoir" },
      frequency: { kind: "yearly", month: 9, day: 1 }, appliesTo: { all: true }, proof: { kind: "photo" }, failOpensFault: false },
    { key: "water_quality", label: { en: "Water quality test", fr: "Test de qualité de l'eau" },
      frequency: { kind: "yearly", month: 9, day: 1 }, appliesTo: { all: true }, proof: { kind: "reading", unit: "NTU", max: 5 }, failOpensFault: true },
  ],
};

export const defaultSettings = {
  // Thresholds to be agreed per pump size; null = any measured flow passes, flagged in reports.
  minFlowLpmByPumpKw: { "2.2": null, "1.1": null, "0.75": null } as Record<string, number | null>,
  maxCheckAgeDays: 90,
  dueSoonDays: 7,
  overdueGraceDays: 7,
};
