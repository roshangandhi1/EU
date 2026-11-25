import { registerBoreholesStrings } from "@eu/boreholes/mobile";
import { FORESTRY_STREAMS, registerForestryStrings, type ForestryStream } from "@eu/forestry/mobile";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useT } from "../i18n";
import type { Session } from "../session";
import { Button } from "../ui";
import { BoreholesHome } from "./boreholes/BoreholesHome";
import { ForestryHome } from "./forestry/ForestryHome";

registerForestryStrings();
registerBoreholesStrings();

export interface ModuleTile {
  key: string;
  label: string;
  open: (close: () => void) => ReactNode;
}

/**
 * One tile per field module this phone holds records for. The server only sends a user the
 * records they may read, so "has synced plots" is a fair test of "may use this module".
 */
export function useModuleTiles(session: Session): ModuleTile[] {
  const t = useT();
  const [streams, setStreams] = useState<ForestryStream[]>([]);
  const [boreholes, setBoreholes] = useState(false);
  const lastOk = session.status.lastOk;
  useEffect(() => {
    let live = true;
    void (async () => {
      const found: ForestryStream[] = [];
      for (const s of FORESTRY_STREAMS) if ((await session.client.list(`${s}.plot`)).length > 0) found.push(s);
      const hasBh = (await session.client.list("boreholes.borehole")).length > 0;
      if (live) {
        setStreams(found);
        setBoreholes(hasBh);
      }
    })();
    return () => {
      live = false;
    };
  }, [session, lastOk]);
  const tiles: ModuleTile[] = streams.map((s) => ({
    key: s,
    label: t(`forestry.${s}`),
    open: (close) => <ForestryHome session={session} stream={s} onBack={close} />,
  }));
  if (boreholes) tiles.push({ key: "boreholes", label: t("boreholes.title"), open: (close) => <BoreholesHome session={session} onBack={close} /> });
  return tiles;
}

export function ModuleTiles({ tiles, onOpen }: { tiles: ModuleTile[]; onOpen: (tile: ModuleTile) => void }) {
  if (tiles.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {tiles.map((tile) => (
        <Button key={tile.key} label={tile.label} onPress={() => onOpen(tile)} />
      ))}
    </View>
  );
}
