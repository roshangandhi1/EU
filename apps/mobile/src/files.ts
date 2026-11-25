import type { SqlDriver } from "@eu/sync/sql-store";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { API_BASE } from "./config";
import { DeviceRevokedError } from "@eu/sync/client";
import { SessionEndedError } from "./api";
import type { Drafts } from "./drafts";

/** Longest edge after compression: enough to see seedlings and pump parts, ~200–400 KB as JPEG. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;
const UPLOAD_BATCH = 10;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS evidence_files (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  lat REAL, lng REAL, accuracy_m REAL,
  taken_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'local',
  reason TEXT
);
CREATE INDEX IF NOT EXISTS evidence_files_status ON evidence_files(status);
`;

export type FileStatus = "local" | "uploaded" | "rejected" | "missing";

/** What capture() gives back: a stored photo, nothing (cancelled), or a refused permission. */
export type CaptureResult = { fileId: string } | null | { denied: true; canAskAgain: boolean };

/** Which form and photo slot a capture is for, so a photo can be recovered if Android kills the app. */
export interface CaptureFor {
  draftKey: string;
  slot: string;
}
const MARKER = "capture:marker";

interface Row {
  id: string;
  entity: string;
  scope_id: string;
  path: string;
  sha256: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  taken_at: string;
  status: FileStatus;
}

/**
 * Photos as evidence. capture() returns an id at once, offline; records store that id.
 * Photos upload separately (upload()), so a record never waits for its photo and a photo
 * that fails to upload stays on the phone and is retried.
 */
export class EvidenceFiles {
  private constructor(
    private db: SqlDriver,
    private getToken: () => Promise<string | null>,
    private drafts: Drafts,
  ) {}

  static async open(db: SqlDriver, getToken: () => Promise<string | null>, drafts: Drafts): Promise<EvidenceFiles> {
    await db.exec(SCHEMA);
    return new EvidenceFiles(db, getToken, drafts);
  }

  private dir(): Directory {
    const d = new Directory(Paths.document, "evidence");
    if (!d.exists) d.create({ intermediates: true });
    return d;
  }

  /**
   * Opens the camera, compresses the photo, stamps it with GPS (if available within 10 s) and
   * stores it. Returns null if the user cancels, or `denied` if camera permission is refused.
   * `entity` is the record type the photo belongs to (its write permission governs the upload).
   * `recover` names the form draft the photo belongs to, in case Android kills the app meanwhile.
   */
  async capture(opts: { entity: string; scopeId: string; recover?: CaptureFor }): Promise<CaptureResult> {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { denied: true, canAskAgain: perm.canAskAgain };
    if (opts.recover) await this.drafts.set(MARKER, { ...opts, at: new Date().toISOString() });
    try {
      // 0.7 already shrinks the camera file a lot before we decode it again (2 GB phones).
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: false, allowsEditing: false });
      if (shot.canceled || !shot.assets[0]) return null;
      return { fileId: await this.store(shot.assets[0], opts) };
    } finally {
      if (opts.recover) await this.drafts.clear(MARKER).catch(() => undefined);
    }
  }

  /**
   * After a cold start: if Android killed the app while the camera was open, keep that photo and
   * hand it to the form's draft (Drafts.takeRecovered). Best effort.
   */
  async recoverPending(): Promise<void> {
    try {
      const marker = await this.drafts.get<{ entity: string; scopeId: string; recover: CaptureFor }>(MARKER);
      if (!marker) return;
      await this.drafts.clear(MARKER);
      const res = await ImagePicker.getPendingResultAsync();
      if (!res || !("assets" in res) || res.canceled || !res.assets?.[0]) return;
      const fileId = await this.store(res.assets[0], marker.value);
      await this.drafts.addRecovered(marker.value.recover.draftKey, { slot: marker.value.recover.slot, fileId });
    } catch (e) {
      console.warn("photo recovery failed", e);
    }
  }

  private async store(src: ImagePicker.ImagePickerAsset, opts: { entity: string; scopeId: string }): Promise<string> {
    const takenAt = new Date().toISOString();
    const position = locate(); // in parallel with compression
    const longest = Math.max(src.width, src.height);
    const resize = longest > MAX_EDGE ? [{ resize: src.width >= src.height ? { width: MAX_EDGE } : { height: MAX_EDGE } }] : [];
    const out = await manipulateAsync(src.uri, resize, { compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    // The camera's own file stays in the cache otherwise and fills the phone.
    try {
      const original = new File(src.uri);
      if (original.exists && src.uri !== out.uri) original.delete();
    } catch {
      // not ours to delete on some phones: the system clears its cache later
    }

    const id = Crypto.randomUUID();
    const dest = new File(this.dir(), `${id}.jpg`);
    await new File(out.uri).move(dest);
    const sha256 = (await dest.digest("SHA-256")).toLowerCase();
    const pos = await position;
    await this.db.run(
      "INSERT INTO evidence_files (id, entity, scope_id, path, sha256, lat, lng, accuracy_m, taken_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, opts.entity, opts.scopeId, dest.uri, sha256, pos?.lat ?? null, pos?.lng ?? null, pos?.accuracy ?? null, takenAt],
    );
    return id;
  }

  async status(id: string): Promise<FileStatus> {
    const [row] = await this.db.all<{ status: FileStatus }>("SELECT status FROM evidence_files WHERE id = ?", [id]);
    return row?.status ?? "missing";
  }

  /** Local URI for showing a thumbnail on the phone (the photo is kept after upload). */
  async uri(id: string): Promise<string | null> {
    const [row] = await this.db.all<{ path: string }>("SELECT path FROM evidence_files WHERE id = ?", [id]);
    return row?.path ?? null;
  }

  async pendingCount(): Promise<number> {
    const [row] = await this.db.all<{ n: number }>("SELECT count(*) AS n FROM evidence_files WHERE status = 'local'");
    return row?.n ?? 0;
  }

  /** Uploads waiting photos, oldest first. Stops quietly when offline; throws on a revoked device or an ended session. */
  async upload(): Promise<{ uploaded: number; rejected: number }> {
    const token = await this.getToken();
    if (!token) return { uploaded: 0, rejected: 0 };
    const rows = await this.db.all<Row>("SELECT * FROM evidence_files WHERE status = 'local' ORDER BY taken_at LIMIT ?", [UPLOAD_BATCH]);
    let uploaded = 0;
    let rejected = 0;
    for (const r of rows) {
      const form = new FormData();
      form.append(
        "meta",
        JSON.stringify({
          id: r.id,
          entity: r.entity,
          scopeId: r.scope_id,
          mime: "image/jpeg",
          sha256: r.sha256,
          lat: r.lat,
          lng: r.lng,
          accuracyM: r.accuracy_m,
          takenAt: r.taken_at,
          deviceNow: new Date().toISOString(),
        }),
      );
      // React Native's fetch streams a file from its URI when given { uri, name, type }.
      form.append("file", { uri: r.path, name: `${r.id}.jpg`, type: "image/jpeg" } as unknown as Blob);
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/files`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
      } catch {
        break; // offline: try again next sync
      }
      const body = (await res.json().catch(() => ({}))) as { status?: string; reason?: string; error?: string };
      if (res.status === 401 && body.error === "device_revoked") throw new DeviceRevokedError();
      if (res.status === 401 && body.error === "session_ended") throw new SessionEndedError();
      if (body.status === "uploaded" || body.status === "duplicate") {
        await this.db.run("UPDATE evidence_files SET status = 'uploaded' WHERE id = ?", [r.id]);
        uploaded++;
      } else if (body.status === "rejected") {
        await this.db.run("UPDATE evidence_files SET status = 'rejected', reason = ? WHERE id = ?", [body.reason ?? null, r.id]);
        rejected++;
      } else {
        break; // server busy or storage not configured: keep the photo and retry later
      }
    }
    return { uploaded, rejected };
  }

  /** Revoked device: delete every photo and its row. */
  async wipe(): Promise<void> {
    const d = new Directory(Paths.document, "evidence");
    if (d.exists) d.delete();
    await this.db.run("DELETE FROM evidence_files");
  }
}

async function locate(): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 10_000));
    const fix = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout]);
    const pos = fix ?? (await Location.getLastKnownPositionAsync());
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null } : null;
  } catch {
    return null;
  }
}
