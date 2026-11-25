import { t, type Locale } from "@eu/core/i18n";
import type { OpsMapLabels } from "@/components/ops-map";

export function opsMapLabels(locale: Locale): OpsMapLabels {
  const u = (k: string) => t(locale, `ui.map.${k}`);
  return {
    aria: u("title"),
    layers: { bamboo: u("bamboo"), miombo: u("miombo"), boreholes: u("boreholes"), schools: u("schools") },
    area: t(locale, "forestry.area_ha"), operational: u("operational"), notOperational: u("notOperational"), open: u("open"),
    selectHint: u("selectHint"), pupils: u("pupils"), people: u("people"), village: u("village"), lastVisit: u("lastVisit"), close: t(locale, "ui.form.close"),
  };
}
