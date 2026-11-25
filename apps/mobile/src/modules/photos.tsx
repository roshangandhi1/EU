import { colors, radius, space } from "@eu/core/tokens";
import { useEffect, useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import { saveErrorKey } from "../errors";
import type { FileStatus } from "../files";
import { useT } from "../i18n";
import type { Session } from "../session";
import { Button, Notice, Txt } from "../ui";

function Thumb({ session, id }: { session: Session; id: string }) {
  const t = useT();
  const [uri, setUri] = useState<string | null>(null);
  const [status, setStatus] = useState<FileStatus>("local");
  useEffect(() => {
    void session.files.uri(id).then(setUri);
    void session.files.status(id).then(setStatus);
  }, [session, id]);
  return (
    <View style={s.thumb} accessible accessibilityLabel={t(status === "uploaded" ? "ux.photoSent" : status === "rejected" ? "ux.photoRefused" : "ux.photoWaiting")}>
      {uri ? <Image source={{ uri }} style={s.img} /> : <View style={[s.img, { backgroundColor: colors.border }]} />}
      <Text style={[s.badge, status === "uploaded" ? s.up : status === "rejected" ? s.bad : null]}>{status === "uploaded" ? "✓" : status === "rejected" ? "✕" : "◷"}</Text>
    </View>
  );
}

/**
 * Photo evidence for a record: take photos (stored offline, uploaded on sync) and show them with
 * an upload badge. `entity` is the record type whose write permission governs the upload.
 */
export function PhotoStrip({ session, entity, scopeId, ids, onChange, label, hint, draftKey, slot = "photos" }: {
  session: Session; entity: string; scopeId: string; ids: string[]; onChange: (ids: string[]) => void; label?: string; hint?: string;
  /** The form's draft: a photo taken while Android kills the app is given back to it (see Drafts). */
  draftKey?: string;
  slot?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"denied" | "blocked" | string | null>(null);
  const take = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await session.files.capture({ entity, scopeId, ...(draftKey ? { recover: { draftKey, slot } } : {}) });
      if (r && "denied" in r) setProblem(r.canAskAgain ? "denied" : "blocked");
      else if (r) onChange([...ids, r.fileId]);
    } catch (e) {
      setProblem(saveErrorKey(e) === "ux.errPhoneFull" ? "ux.errPhoneFull" : "ux.errPhoto");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      {hint ? <Txt variant="small" tone="muted">{hint}</Txt> : null}
      {ids.length > 0 && (
        <View style={s.row}>
          {ids.map((id) => (
            <Thumb key={id} session={session} id={id} />
          ))}
        </View>
      )}
      {problem === "denied" || problem === "blocked" ? (
        <Notice tone="warning" icon="camera" title={t("ux.cameraDenied")}>
          <Txt>{t(problem === "blocked" ? "ux.cameraBlocked" : "ux.cameraAskAgain")}</Txt>
          {problem === "blocked" && <Button kind="secondary" icon="settings" label={t("ux.openSettings")} onPress={() => void Linking.openSettings()} />}
        </Notice>
      ) : problem ? (
        <Notice tone="critical">{t(problem)}</Notice>
      ) : null}
      <Button kind="secondary" icon="camera" label={ids.length ? t("ux.anotherPhoto") : (label ?? t("forestry.m.take_photo"))} onPress={() => void take()} busy={busy} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  thumb: { width: 76, height: 76 },
  img: { width: 76, height: 76, borderRadius: radius.md },
  badge: { position: "absolute", right: 4, bottom: 4, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 5, fontSize: 13, fontWeight: "700", color: colors.textMuted, overflow: "hidden" },
  up: { color: colors.statusGood },
  bad: { color: colors.statusCritical },
});
