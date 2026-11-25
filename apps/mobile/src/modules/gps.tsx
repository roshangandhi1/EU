import { Linking, View } from "react-native";
import { useT } from "../i18n";
import { Button, IconButton, StatusChip } from "../ui";
import { noFixKey, type Fix, type NoFix } from "./location";

/**
 * Whether the record will carry a GPS position: "locating…" while it waits, the accuracy once it
 * has a fix, or why not, with a retry and (when location is refused or off) a way to the settings.
 */
export function GpsStatus({ fix, locating, problem, onRetry }: { fix: Fix | null; locating: boolean; problem: NoFix | undefined; onRetry: () => void }) {
  const t = useT();
  const label = locating ? t("forestry.m.locating") : fix ? t("forestry.m.gps_ok", { m: Math.round(fix.accuracyM ?? 0) }) : t(noFixKey(problem ?? null));
  const blocked = !locating && !fix && (problem === "denied" || problem === "off");
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <StatusChip icon="pin" label={label} tone={fix && !locating ? "good" : problem === "denied" || problem === "off" ? "warning" : "muted"} />
        </View>
        {!locating && <IconButton icon="locate" label={t("forestry.m.record_gps")} onPress={onRetry} />}
      </View>
      {blocked && <Button kind="secondary" icon="settings" label={t(problem === "off" ? "ux.turnOnLocation" : "ux.openSettings")} onPress={() => void Linking.openSettings()} />}
    </View>
  );
}
