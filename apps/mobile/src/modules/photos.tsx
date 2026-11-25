import { colors, radius, space } from "@eu/core/tokens";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { FileStatus } from "../files";
import { useT } from "../i18n";
import type { Session } from "../session";
import { Button } from "../ui";

function Thumb({ session, id }: { session: Session; id: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [status, setStatus] = useState<FileStatus>("local");
  useEffect(() => {
    void session.files.uri(id).then(setUri);
    void session.files.status(id).then(setStatus);
  }, [session, id]);
  return (
    <View style={s.thumb}>
      {uri ? <Image source={{ uri }} style={s.img} /> : <View style={[s.img, { backgroundColor: colors.border }]} />}
      <Text style={[s.badge, status === "uploaded" ? s.up : status === "rejected" ? s.bad : null]}>{status === "uploaded" ? "✓" : status === "rejected" ? "✕" : "◷"}</Text>
    </View>
  );
}

/**
 * Photo evidence for a record: take photos (stored offline, uploaded on sync) and show them with
 * an upload badge. `entity` is the record type whose write permission governs the upload.
 */
export function PhotoStrip({ session, entity, scopeId, ids, onChange, label }: {
  session: Session; entity: string; scopeId: string; ids: string[]; onChange: (ids: string[]) => void; label?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const take = async () => {
    setBusy(true);
    try {
      const r = await session.files.capture({ entity, scopeId });
      if (r) onChange([...ids, r.fileId]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: space.xs }}>
      {ids.length > 0 && (
        <View style={s.row}>
          {ids.map((id) => (
            <Thumb key={id} session={session} id={id} />
          ))}
        </View>
      )}
      <Button kind="secondary" label={label ?? t("forestry.m.take_photo")} onPress={() => void take()} disabled={busy} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  thumb: { width: 72, height: 72 },
  img: { width: 72, height: 72, borderRadius: radius.sm },
  badge: { position: "absolute", right: 2, bottom: 2, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 4, fontSize: 12, color: colors.textMuted },
  up: { color: colors.statusGood },
  bad: { color: colors.statusCritical },
});
