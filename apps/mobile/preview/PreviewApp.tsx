/**
 * Browser preview of the phone app, for screenshots and design review only (never shipped).
 * Renders the real screens against an in-memory session filled with the same demo set the web
 * loads. URL: ?s=signin|pin|unlock|home|empty|revoked &lang=en|fr &sync=ok|pending|offline|nonet|failed|clock|never
 * &notice=<i18n key for the sign-in screen> &other=1 (sign-in blocked by another person's unsent work)
 * Build: see preview/README.md.
 */
import type { Locale } from "@eu/core/i18n";
import { defaultTemplate } from "@eu/boreholes/mobile";
import { useFonts } from "expo-font";
import { useMemo, useReducer, useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../src/strings";
import { LocaleContext } from "../src/i18n";
import type { Session } from "../src/session";
import { Home, Revoked } from "../src/screens/Home";
import { SetPin, Unlock } from "../src/screens/Pin";
import { ChangePassword } from "../src/screens/ChangePassword";
import { SignIn } from "../src/screens/SignIn";

type Row = Record<string, unknown> & { id: string; scopeId: string };
const uid = () => Math.random().toString(36).slice(2, 10);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

function square(lng: number, lat: number, ha: number) {
  const side = Math.sqrt(ha * 10_000);
  const dLat = side / 2 / 111_320;
  const dLng = side / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { type: "MultiPolygon", coordinates: [[[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]]] };
}

const FIRST = ["Amani", "Bijou", "Christelle", "Daniel", "Esther", "Fiston", "Grâce", "Héritier", "Israël", "Joëlle", "Kevin", "Lydie"];
const LAST = ["Kabila", "Mukendi", "Ilunga", "Kasongo", "Mwamba", "Ngoy", "Banza", "Kalenga"];

function demoStore(): Map<string, Row[]> {
  const db = new Map<string, Row[]>();
  const put = (entity: string, scopeId: string, fields: Record<string, unknown>, id = uid()) => {
    const list = db.get(entity) ?? [];
    list.push({ id, scopeId, deviceTime: new Date().toISOString(), serverTime: new Date().toISOString(), voidedAt: null, ...fields });
    db.set(entity, list);
    return id;
  };
  const now = new Date();
  const y = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const sc = "demo-school-1";
  put("school.school", sc, { siteId: sc, code: "DEMO", name: "DEMO-École primaire Kiabukwa", locale: "fr", shiftsRunning: ["morning"] });
  const yearId = put("school.academic_year", sc, { label: `${y}-${y + 1}`, startsOn: `${y}-09-01`, endsOn: `${y + 1}-07-02` });
  const termId = put("school.term", sc, { academicYearId: yearId, number: 1, startsOn: `${y}-09-01`, endsOn: `${y}-12-20` });
  const classIds = [1, 2, 3, 4, 5, 6].map((level) => put("school.class", sc, { academicYearId: yearId, level, section: "A", shift: "morning", classroomId: null }));
  const feeId = put("school.fee_item", sc, { academicYearId: yearId, termId, name: "Minerval T1", levels: [1, 2, 3, 4, 5, 6], amount: 15_000, dueOn: `${y}-10-15` });
  put("school.receipt_book", sc, { firstNumber: 1001, lastNumber: 1100, assignedTo: "preview-user" });
  put("school.device_tag", sc, { phoneId: "preview-device", tag: "A" });
  const pupils: { sid: string; cid: string }[] = [];
  for (let i = 0; i < 48; i++) {
    const level = (i % 6) + 1;
    const sid = put("school.student", sc, {
      studentNumber: `DEMO-${String(i + 1).padStart(3, "0")}`, firstName: FIRST[i % FIRST.length], lastName: LAST[(i * 5) % LAST.length], postName: "",
      sex: i % 2 === 0 ? "F" : "M", dateOfBirth: null, birthYearEstimate: now.getUTCFullYear() - 5 - level, guardianName: "", guardianPhone: "", village: "Kiabukwa",
    });
    put("school.enrolment", sc, { studentId: sid, classId: classIds[level - 1], academicYearId: yearId, enrolledOn: `${y}-09-01`, leftOn: null, status: "active" });
    pupils.push({ sid, cid: classIds[level - 1]! });
  }
  for (let back = 1; back <= 5; back++) {
    const day = daysAgo(back);
    for (const cid of classIds) put("school.register", sc, { classId: cid, date: day });
    pupils.filter((_, i) => (i + back) % 9 === 0).forEach((p) => put("school.absence", sc, { studentId: p.sid, classId: p.cid, date: day, reason: "sick" }));
  }
  pupils.slice(0, 18).forEach((p, i) => put("school.payment", sc, { studentId: p.sid, paidOn: daysAgo(i % 5), amount: i % 3 === 0 ? 7_500 : 15_000, receiptNumber: 1001 + i, feeItemIds: [feeId] }));

  const plots = [
    ["bamboo", "DEMO-B01", 24.775, -8.705, 4, "bambusa_vulgaris", 1700, "planted"],
    ["bamboo", "DEMO-B02", 24.782, -8.705, 3, "bambusa_vulgaris", 1250, "planted"],
    ["bamboo", "DEMO-B03", 24.768, -8.712, 6, "oxytenanthera_abyssinica", 0, "pegged"],
    ["miombo", "DEMO-M01", 24.8, -8.72, 5, "pterocarpus_angolensis", 2500, "planted"],
    ["miombo", "DEMO-M02", 24.808, -8.72, 2, "afzelia_quanzensis", 900, "planted"],
    ["miombo", "DEMO-M03", 24.815, -8.728, 8, "pterocarpus_angolensis", 0, "pegged"],
  ] as const;
  for (const [stream, code, lng, lat, ha, species, count, status] of plots) {
    const scope = `plot-${code}`;
    put(`${stream}.plot`, scope, { code, village: "Kiabukwa", status, species: [species], areaHa: ha });
    put(`${stream}.boundary`, scope, { geom: square(lng, lat, ha) });
    if (count) put(`${stream}.planting`, scope, { plantedOn: daysAgo(30), lines: [{ species, count }], isGapFilling: false, photos: [] });
  }

  const holes = [
    ["DEMO-BH01", "Kiabukwa", -8.709, 24.787, "operational", 9],
    ["DEMO-BH02", "Malambwe", -8.74, 24.83, "operational", 10],
    ["DEMO-BH03", "Kayumba", -8.69, 24.76, "drilled", null],
    ["DEMO-BH04", "Mukanga", -8.755, 24.79, "operational", 70],
    ["DEMO-BH05", "Kisanga", -8.725, 24.745, "needs_repair", 12],
  ] as const;
  holes.forEach(([code, village, lat, lng, lifecycle, visited], i) => {
    const scope = `bh-${code}`;
    put("boreholes.borehole", scope, { code, village, gpsLat: lat, gpsLng: lng, lifecycle, pumpRatingKw: i % 2 ? 1.1 : 2.2, handedOverOn: daysAgo(125), commissionedOn: lifecycle === "drilled" ? null : daysAgo(120) });
    if (visited !== null)
      put("boreholes.visit", scope, {
        visitedOn: daysAgo(visited), kind: "routine",
        results: defaultTemplate.tasks.map((t) => ({ taskKey: t.key, done: true, pass: lifecycle !== "needs_repair", ...(t.proof.kind === "reading" ? { value: 30 } : {}) })),
      });
  });
  return db;
}

type SyncMode = "ok" | "pending" | "offline" | "nonet" | "failed" | "clock" | "never";

const q = () => new URLSearchParams(globalThis.location?.search ?? "");

function makeSession(phase: Session["phase"], empty: boolean, sync: SyncMode, notice: string | null, other: boolean): Session {
  const db = empty ? new Map<string, Row[]>() : demoStore();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const lastOk = sync === "never" ? null : new Date(Date.now() - 42 * 60_000).toISOString();
  const drafts = new Map<string, { value: unknown; savedAt: string }>();
  const rejections = sync === "failed"
    ? [
        { rowId: 2, mutationId: "m2", entity: "school.payment", recordId: "r2", status: "rejected", reason: "forbidden", at: new Date(Date.now() - 3 * 3600_000).toISOString(), record: { amount: 15000, receiptNumber: 1019, paidOn: daysAgo(1) } },
        { rowId: 1, mutationId: "m1", entity: "school.student", recordId: "r1", status: "partial", conflicts: ["guardianPhone"], at: new Date(Date.now() - 26 * 3600_000).toISOString(), record: { lastName: "KABILA", firstName: "Amani", studentNumber: "DEMO-001" } },
      ]
    : [];
  const s = {
    phase,
    changes: 0,
    user: { id: "preview-user", name: "Roshan" },
    roles: [{ role: "system_admin", scope: { type: "global" } }],
    notice,
    otherUser: other ? { name: "Mukendi Grâce", records: 4, photos: 2, canSendNow: true } : null,
    status: {
      running: false,
      pending: sync === "pending" || sync === "offline" ? 3 : 0,
      photosPending: sync === "pending" ? 2 : 0,
      nextCutoff: null,
      rejected: rejections.length,
      lastOk,
      last: sync === "failed" ? { ok: false } : sync === "nonet" ? { ok: false, error: "offline" } : lastOk ? { ok: true } : null,
      offline: sync === "offline",
      noInternet: sync === "nonet",
      clockSuspect: sync === "clock",
    },
    drafts: {
      async get(k: string) {
        return drafts.get(k) ?? null;
      },
      async set(k: string, value: unknown) {
        drafts.set(k, { value, savedAt: new Date().toISOString() });
      },
      async clear(k: string) {
        drafts.delete(k);
      },
      async takeRecovered() {
        return [];
      },
    },
    async listRejections() {
      return [...rejections];
    },
    async dismissRejection(rowId: number) {
      const i = rejections.findIndex((r) => r.rowId === rowId);
      if (i >= 0) rejections.splice(i, 1);
      s.status.rejected = rejections.length;
      emit();
    },
    async localSaved() {
      s.changes += 1;
      emit();
    },
    toSignIn() {
      s.phase = "signIn";
      s.notice = "app.forgotPinNotice";
      emit();
    },
    async canUnlock() {
      return true;
    },
    backToUnlock() {
      s.phase = "unlock";
      emit();
    },
    async restart() {
      s.phase = "signIn";
      emit();
    },
    async sendPreviousWork() {
      await new Promise((r) => setTimeout(r, 600));
      s.otherUser = null;
      return "sent" as const;
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    client: {
      async list(entity: string) {
        return [...(db.get(entity) ?? [])];
      },
      async create(entity: string, scopeId: string, fields: Record<string, unknown>) {
        const id = uid();
        db.set(entity, [...(db.get(entity) ?? []), { id, scopeId, deviceTime: new Date().toISOString(), voidedAt: null, pending: true, ...fields }]);
        s.status.pending += 1;
        return id;
      },
      async update(entity: string, id: string, fields: Record<string, unknown>) {
        db.set(entity, (db.get(entity) ?? []).map((r) => (r.id === id ? { ...r, ...fields } : r)));
      },
      async void(entity: string, id: string) {
        db.set(entity, (db.get(entity) ?? []).map((r) => (r.id === id ? { ...r, voidedAt: new Date().toISOString() } : r)));
      },
    },
    files: {
      async capture() {
        return null;
      },
      async uri() {
        return null;
      },
      async status() {
        return "local";
      },
    },
    async syncNow() {
      s.status.running = true;
      emit();
      await new Promise((r) => setTimeout(r, 900));
      Object.assign(s.status, { running: false, pending: 0, photosPending: 0, offline: false, noInternet: false, lastOk: new Date().toISOString(), last: { ok: true, pushed: 1, pulled: 0 } });
      s.changes += 1;
      emit();
    },
    lock() {
      s.phase = "unlock";
      emit();
    },
    async loadDemo() {
      return "app.demoLoaded";
    },
    async refreshCounts() {
      emit();
    },
    async signIn() {
      if (s.otherUser) return "app.otherUserPending";
      s.phase = "setPin";
      emit();
      return null;
    },
    async setPin() {
      s.phase = "home";
      emit();
    },
    passwordForced: q().get("forced") === "1",
    needsCurrentPassword() {
      return q().get("forced") !== "1";
    },
    openChangePassword() {
      s.passwordForced = false;
      s.phase = "changePassword";
      emit();
    },
    cancelChangePassword() {
      s.phase = "home";
      emit();
    },
    async changePassword(current: string | null) {
      await new Promise((r) => setTimeout(r, 400));
      if (current !== null && current !== "old-password-1") return "app.pw_wrong_password";
      s.notice = "app.pwChanged";
      s.phase = s.passwordForced ? "setPin" : "home";
      s.passwordForced = false;
      emit();
      return null;
    },
    async unlock(v: string) {
      if (v !== "1234") return { ok: false as const, remaining: 4 };
      s.phase = "home";
      emit();
      return { ok: true as const };
    },
  };
  return s as unknown as Session;
}

export default function PreviewApp() {
  const q = new URLSearchParams(globalThis.location?.search ?? "");
  const which = q.get("s") ?? "home";
  const phase = ({ signin: "signIn", pin: "setPin", unlock: "unlock", revoked: "revoked", password: "changePassword" } as Record<string, Session["phase"]>)[which] ?? "home";
  const session = useMemo(() => makeSession(phase, which === "empty", (q.get("sync") as SyncMode) ?? "ok", q.get("notice"), q.get("other") === "1"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [locale, setLocale] = useState<Locale>((q.get("lang") as Locale) ?? "fr");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // On Android the fonts are bundled by the expo-font config plugin; the browser loads them here.
  const [fontsReady] = useFonts({
    InterTight_400Regular: require("../assets/fonts/InterTight_400Regular.ttf"),
    InterTight_600SemiBold: require("../assets/fonts/InterTight_600SemiBold.ttf"),
    InterTight_700Bold: require("../assets/fonts/InterTight_700Bold.ttf"),
    InterTight_800ExtraBold: require("../assets/fonts/InterTight_800ExtraBold.ttf"),
  });
  useEffect(() => session.subscribe(rerender), [session]);

  let screen;
  if (session.phase === "signIn") screen = <SignIn session={session} />;
  else if (session.phase === "changePassword") screen = <ChangePassword session={session} />;
  else if (session.phase === "setPin") screen = <SetPin session={session} />;
  else if (session.phase === "unlock") screen = <Unlock session={session} />;
  else if (session.phase === "revoked") screen = <Revoked session={session} />;
  else screen = <Home session={session} />;
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <LocaleContext.Provider value={{ locale, setLocale }}>{screen}</LocaleContext.Provider>
    </SafeAreaProvider>
  );
}
