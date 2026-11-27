/**
 * Reading a pupil list saved from Excel (or any spreadsheet) as CSV, for the bulk import screen.
 * Pure functions only: decoding, delimiter detection, CSV cells, column headers (EN or FR), and
 * one pupil per row. Matching classes and spotting duplicates need the school's data: see
 * planImport below.
 */
import { createHash } from "node:crypto";
import { currentYear, findLikelyDuplicates, insertMutation, nextStudentNumber, student as studentSchema, type SchoolData } from "@eu/schools";
import type { Mutation } from "@eu/sync";

export { decodeCsv, problemsCsv } from "./csv-text";

/** The most rows one file may hold (a large school has 1,000-1,500 pupils). */
export const MAX_IMPORT_ROWS = 3000;

export const IMPORT_FIELDS = [
  "lastName", "postName", "firstName", "sex", "birth", "birthPlace", "idNumber", "permNumber",
  "class", "enrolledOn", "guardianName", "guardianPhone", "village",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_FIELDS: readonly ImportField[] = ["lastName", "firstName", "sex", "birth"];

/** Template headers. Either language's headers (and the usual variants) are recognised in any file. */
export const TEMPLATE_HEADERS: Record<"en" | "fr", Record<ImportField, string>> = {
  fr: {
    lastName: "NOM", postName: "Post-nom", firstName: "Prénom", sex: "Sexe (F/G)", birth: "Date de naissance",
    birthPlace: "Lieu de naissance", idNumber: "N° ID", permNumber: "N° perm", class: "Classe", enrolledOn: "Date d'inscription",
    guardianName: "Parent ou tuteur", guardianPhone: "Téléphone du parent", village: "Village ou quartier",
  },
  en: {
    lastName: "SURNAME", postName: "Post-name", firstName: "First name", sex: "Sex (F/B)", birth: "Date of birth",
    birthPlace: "Place of birth", idNumber: "ID number (N° ID)", permNumber: "Perm number (N° perm)", class: "Class", enrolledOn: "Enrolment date",
    guardianName: "Parent or guardian", guardianPhone: "Parent's phone", village: "Village or area",
  },
};

const ALIASES: Record<ImportField, string[]> = {
  lastName: ["nom", "surname", "lastname", "familyname", "nomdefamille"],
  postName: ["postnom", "postname", "middlename", "deuxiemenom"],
  firstName: ["prenom", "firstname", "givenname", "prenoms"],
  sex: ["sexe", "sex", "genre", "gender"],
  birth: ["datedenaissance", "naissance", "dateofbirth", "birthdate", "dob", "anneedenaissance", "birthyear", "yearofbirth", "ne", "neele"],
  birthPlace: ["lieudenaissance", "placeofbirth", "birthplace", "nea", "lieu"],
  idNumber: ["noid", "nid", "numeroid", "id", "idnumber", "nationalid", "nidnational", "numid"],
  permNumber: ["noperm", "nperm", "numeroperm", "nopermanent", "numeropermanent", "perm", "permnumber", "permanentnumber", "matricule"],
  class: ["classe", "class", "grade", "niveau"],
  enrolledOn: ["datedinscription", "dateinscription", "inscritle", "inscription", "enrolmentdate", "enrollmentdate", "enrolledon", "enrolled", "datedentree"],
  guardianName: ["parentoututeur", "parent", "tuteur", "parenttuteur", "guardian", "parentorguardian", "responsable", "nomduparent"],
  guardianPhone: ["telephoneduparent", "telephone", "tel", "phone", "guardianphone", "parentsphone", "parentphone", "telephoneparent", "contact"],
  village: ["villageouquartier", "village", "quartier", "villageorarea", "area", "adresse", "address", "localite"],
};

/** Lower case, no accents, no spaces or punctuation, nothing in brackets: "Sexe (F/G)" -> "sexe". */
export function headerKey(s: string): string {
  return s
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/°|º/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const BY_ALIAS = new Map<string, ImportField>(IMPORT_FIELDS.flatMap((f) => ALIASES[f].map((a) => [a, f] as const)));

/** The delimiter used on the first line outside quotes: semicolon (French Excel), comma or tab. */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts]++;
  }
  if (counts["\t"] >= counts[";"] && counts["\t"] >= counts[","] && counts["\t"] > 0) return "\t";
  return counts[";"] >= counts[","] && counts[";"] > 0 ? ";" : counts[","] > 0 ? "," : ";";
}

/** Rows of cells (RFC 4180: quoted cells may hold the delimiter, quotes "" and line breaks). */
export function parseCsv(text: string, delim: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === delim) { cells.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell);
      rows.push({ line: start, cells });
      cells = []; cell = ""; line++; start = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length) { cells.push(cell); rows.push({ line: start, cells }); }
  return rows
    .map((r) => ({ line: r.line, cells: r.cells.map((c) => c.replace(/\s+/g, " ").trim()) }))
    .filter((r) => r.cells.some((c) => c !== ""));
}

export interface ImportPupil {
  lastName: string;
  postName: string;
  firstName: string;
  sex: "F" | "M";
  dateOfBirth: string | null;
  birthYearEstimate: number | null;
  birthPlace: string;
  idNumber: string;
  permNumber: string;
  guardianName: string;
  guardianPhone: string;
  village: string;
  /** As written in the file ("" when the column is absent or empty). */
  classText: string;
  /** ISO date, or "" to use the screen's default. */
  enrolledOn: string;
}

export interface FileRow {
  line: number;
  cells: string[];
  /** Problem codes (an i18n key under pimport.err, sometimes with ":<detail>"). */
  errors: string[];
  pupil?: ImportPupil;
}

export interface ReadFile {
  delimiter: ";" | "," | "\t";
  headers: string[];
  /** Which column each field is read from. */
  columns: Partial<Record<ImportField, number>>;
  /** Headers that match no field (their cells are not imported). */
  ignored: string[];
  /** Required fields with no column: nothing can be imported until the file has them. */
  missing: ImportField[];
  rows: FileRow[];
  /** Template example rows (surname EXEMPLE/EXAMPLE) that were left out. */
  examples: number;
  tooMany: boolean;
}

const SEX: Record<string, "F" | "M"> = { f: "F", fille: "F", girl: "F", feminin: "F", female: "F", fem: "F", g: "M", m: "M", garcon: "M", boy: "M", b: "M", masculin: "M", male: "M", masc: "M", h: "M" };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function isoIfValid(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

const fullYear = (y: string, nowYear: number) => (y.length === 4 ? Number(y) : Number(y) + (Number(y) <= nowYear % 100 ? 2000 : 1900));

/**
 * A date written the DRC way (day first): 15/03/2018, 15-03-18, 15.03.2018; or 2018-03-15.
 * Only when the second number cannot be a month (3/15/2018, US Excel) is it read month first.
 */
export function readDate(raw: string, nowYear: number): string | null {
  const s = raw.trim().replace(/\s+00:00(:00)?$/, "");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]), y = fullYear(m[3]!, nowYear);
  return b > 12 && a <= 12 ? isoIfValid(y, a, b) : isoIfValid(y, b, a);
}

/** Birth: a full date, or only a year when the exact date is not known. */
function readBirth(raw: string, nowYear: number): { dateOfBirth: string | null; birthYearEstimate: number | null } | null {
  const s = raw.trim();
  if (/^\d{4}$/.test(s)) return { dateOfBirth: null, birthYearEstimate: Number(s) };
  const d = readDate(s, nowYear);
  return d ? { dateOfBirth: d, birthYearEstimate: null } : null;
}

/** Excel shows long numbers as 2,43971E+11 and saves them that way: the phone number is lost. */
const MANGLED_NUMBER = /^\d+([.,]\d+)?e\+?\d+$/i;

/** Reads the whole file: headers, then one pupil per row, with every problem found in each row. */
export function readPupilFile(text: string, today: string): ReadFile {
  const delimiter = detectDelimiter(text);
  const all = parseCsv(text, delimiter);
  const nowYear = Number(today.slice(0, 4));
  // The header is the first row that names at least two known columns (a title line above it is skipped).
  const hIdx = all.findIndex((r, i) => i < 5 && r.cells.filter((c) => BY_ALIAS.has(headerKey(c))).length >= 2);
  const headers = hIdx >= 0 ? all[hIdx]!.cells : [];
  const columns: Partial<Record<ImportField, number>> = {};
  const ignored: string[] = [];
  headers.forEach((h, i) => {
    const f = BY_ALIAS.get(headerKey(h));
    if (f && columns[f] === undefined) columns[f] = i;
    else if (h) ignored.push(h);
  });
  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);
  let body = hIdx >= 0 ? all.slice(hIdx + 1) : all;
  let examples = 0;
  body = body.filter((r) => {
    const ex = columns.lastName !== undefined && /^(exemple|example)$/i.test(r.cells[columns.lastName] ?? "");
    if (ex) examples++;
    return !ex;
  });
  const tooMany = body.length > MAX_IMPORT_ROWS;
  if (tooMany) body = body.slice(0, MAX_IMPORT_ROWS);
  const get = (cells: string[], f: ImportField) => (columns[f] === undefined ? "" : (cells[columns[f]!] ?? "").trim());

  const rows: FileRow[] = missing.length ? body.map((r) => ({ ...r, errors: [] })) : body.map(({ line, cells }) => {
    const errors: string[] = [];
    const lastName = get(cells, "lastName");
    const firstName = get(cells, "firstName");
    if (!lastName) errors.push("lastName");
    if (!firstName) errors.push("firstName");
    const sexRaw = get(cells, "sex");
    const sex = SEX[plain(sexRaw)];
    if (!sex) errors.push(sexRaw ? "sex" : "sexMissing");
    const birthRaw = get(cells, "birth");
    const birth = birthRaw ? readBirth(birthRaw, nowYear) : null;
    if (!birth) errors.push(birthRaw ? "birth" : "birthMissing");
    else if ((birth.dateOfBirth && birth.dateOfBirth > today) || (birth.birthYearEstimate !== null && birth.birthYearEstimate > nowYear)) errors.push("birthFuture");
    else if ((birth.dateOfBirth ? Number(birth.dateOfBirth.slice(0, 4)) : birth.birthYearEstimate!) < 1990) errors.push("birthOld");
    const enrolledRaw = get(cells, "enrolledOn");
    const enrolledOn = enrolledRaw ? readDate(enrolledRaw, nowYear) : "";
    if (enrolledOn === null) errors.push("enrolledOn");
    else if (enrolledOn && enrolledOn > today) errors.push("enrolledFuture");
    const guardianPhone = get(cells, "guardianPhone");
    if (MANGLED_NUMBER.test(guardianPhone)) errors.push("phoneExcel");
    else if (guardianPhone.length > 20) errors.push("phoneLong");
    const pupil: ImportPupil = {
      lastName, postName: get(cells, "postName"), firstName, sex: sex ?? "F",
      dateOfBirth: birth?.dateOfBirth ?? null, birthYearEstimate: birth?.birthYearEstimate ?? null,
      birthPlace: get(cells, "birthPlace"), idNumber: get(cells, "idNumber"), permNumber: get(cells, "permNumber"),
      guardianName: get(cells, "guardianName"), guardianPhone, village: get(cells, "village"),
      classText: get(cells, "class"), enrolledOn: enrolledOn ?? "",
    };
    for (const k of ["lastName", "postName", "firstName", "guardianName", "village", "birthPlace"] as const) if (pupil[k].length > 80) errors.push(`tooLong:${k}`);
    for (const k of ["idNumber", "permNumber"] as const) if (pupil[k].length > 30) errors.push(`tooLong:${k}`);
    return { line, cells, errors, pupil };
  });
  return { delimiter, headers, columns, ignored, missing, rows, examples, tooMany };
}

/** The template file: headers in the chosen language and two example rows that the import skips. */
export function templateCsv(lang: "en" | "fr", exampleClass = "1A"): string {
  const h = TEMPLATE_HEADERS[lang];
  const sep = lang === "fr" ? ";" : ",";
  const ex = lang === "fr"
    ? [["EXEMPLE", "Mwamba", "Marie", "F", "15/03/2019", "Kinshasa", "", "", exampleClass, "", "Mukendi Jean", "+243 970 000 000", "Kiabukwa"],
       ["EXEMPLE", "", "Patrick", "G", "2018", "", "", "", exampleClass, "", "", "", ""]]
    : [["EXAMPLE", "Mwamba", "Marie", "F", "15/03/2019", "Kinshasa", "", "", exampleClass, "", "Mukendi Jean", "+243 970 000 000", "Kiabukwa"],
       ["EXAMPLE", "", "Patrick", "B", "2018", "", "", "", exampleClass, "", "", "", ""]];
  const esc = (c: string) => (/[";,\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return "\uFEFF" + [IMPORT_FIELDS.map((f) => h[f]), ...ex].map((r) => r.map(esc).join(sep)).join("\r\n") + "\r\n";
}

// ---- Matching against the school ----

type ClassLike = { id: string; academicYearId: string; level: number; section: string; shift: "morning" | "afternoon"; voidedAt: string | null };

/** "1A", "1 A", "1re A", "1ère année A", "3B matin", "2e B après-midi": level, section and maybe shift. */
export function readClass(raw: string): { level: number | null; section: string | null; shift: "morning" | "afternoon" | null } {
  let s = plain(raw);
  const shift: "morning" | "afternoon" | null = /apres ?-?midi|afternoon|soir/.test(s) ? "afternoon" : /matin|morning|avant ?-?midi/.test(s) ? "morning" : null;
  s = s.replace(/apres ?-?midi|afternoon|soir|matin(ee)?|morning|avant ?-?midi|vacation|shift/g, " ");
  const lv = /([1-8])(?:\s*(?:ere|er|re|eme|e|st|nd|rd|th)(?![a-z]))?/.exec(s);
  const level = lv ? Number(lv[1]) : null;
  if (lv) s = s.slice(0, lv.index) + " " + s.slice(lv.index + lv[0].length);
  s = s.replace(/\b(annee|annees|year|classe|class|primaire|primary|degre|grade|niveau|section)\b/g, " ");
  const sec = /\b([a-z])\b/.exec(s.replace(/[^a-z]+/g, " "));
  return { level, section: sec ? sec[1]!.toUpperCase() : null, shift };
}

/**
 * The class a row names, among one year's classes. A section or shift may be left out when only one
 * class fits. Returns an error code when none or several fit.
 */
export function matchClass(raw: string, classes: readonly ClassLike[], yearId: string): { id: string } | { error: "classUnknown" | "classAmbiguous" } {
  const { level, section, shift } = readClass(raw);
  if (level === null) return { error: "classUnknown" };
  const fits = classes.filter((c) => !c.voidedAt && c.academicYearId === yearId && c.level === level && (!section || c.section.toUpperCase() === section) && (!shift || c.shift === shift));
  if (fits.length === 1) return { id: fits[0]!.id };
  return { error: fits.length ? "classAmbiguous" : "classUnknown" };
}

/** A short code for a class, as it can be typed in the file: "1A", or "1A matin" when both shifts have a 1A. */
export function classCode(c: ClassLike, all: readonly ClassLike[], lang: "en" | "fr"): string {
  const both = all.some((o) => o.id !== c.id && !o.voidedAt && o.academicYearId === c.academicYearId && o.level === c.level && o.section === c.section);
  const base = `${c.level}${c.section}`;
  if (!both) return base;
  return `${base} ${c.shift === "morning" ? (lang === "fr" ? "matin" : "morning") : lang === "fr" ? "après-midi" : "afternoon"}`;
}

export interface PlanOptions {
  /** Class for rows whose Class cell is empty (or every row when the file has no Class column). */
  defaultClassId: string;
  /** Enrolment date for rows with no date of their own. Fees for periods that ended before it are not charged. */
  defaultEnrolledOn: string;
  today: string;
}

export interface PlannedRow {
  line: number;
  cells: string[];
  status: "ready" | "duplicate" | "error";
  errors: string[];
  /** Who this row may be: existing pupils ("KABEYA Marie (KIA-2026-W0003)") or an earlier line of the file. */
  matches: string[];
  pupil?: ImportPupil & { classId: string; academicYearId: string; enrolledOn: string };
}

type SchoolLike = Pick<SchoolData, "years" | "classes" | "students">;

/**
 * Checks every row against the school: class (in the year of the enrolment date), enrolment date,
 * and likely duplicates among pupils already enrolled and earlier rows of the same file.
 * `skipIds` are pupils this import already created (a resumed import must not match itself).
 */
export function planImport(d: SchoolLike, file: ReadFile, o: PlanOptions, skipIds: ReadonlySet<string> = new Set()): PlannedRow[] {
  const existing = d.students.filter((s) => !s.voidedAt && !skipIds.has(s.id));
  const byPerm = new Map(existing.filter((s) => s.permNumber).map((s) => [plain(s.permNumber), s]));
  const byIdNo = new Map(existing.filter((s) => s.idNumber).map((s) => [plain(s.idNumber), s]));
  const label = (s: (typeof existing)[number]) => `${s.lastName.toUpperCase()} ${s.firstName} (${s.studentNumber})`;
  const earlier: { id: string; line: number; p: ImportPupil }[] = [];
  return file.rows.map(({ line, cells, errors: base, pupil }) => {
    const errors = [...base];
    if (!pupil) return { line, cells, status: "error", errors, matches: [] };
    const enrolledOn = pupil.enrolledOn || o.defaultEnrolledOn;
    const year = enrolledOn ? currentYear(d, enrolledOn) : undefined;
    let classId = "";
    if (!pupil.enrolledOn && !o.defaultEnrolledOn) errors.push("enrolledMissing");
    else if (!year) errors.push("enrolledNoYear");
    else if (pupil.classText) {
      const m = matchClass(pupil.classText, d.classes as ClassLike[], year.id);
      if ("error" in m) errors.push(m.error);
      else classId = m.id;
    } else {
      const c = d.classes.find((x) => x.id === o.defaultClassId && !x.voidedAt);
      if (!c) errors.push("classMissing");
      else if (c.academicYearId !== year.id) errors.push("classOtherYear");
      else classId = c.id;
    }
    if (errors.length) return { line, cells, status: "error", errors, matches: [] };

    const matches = new Set<string>();
    const perm = pupil.permNumber && byPerm.get(plain(pupil.permNumber));
    if (perm) matches.add(label(perm));
    const idn = pupil.idNumber && byIdNo.get(plain(pupil.idNumber));
    if (idn) matches.add(label(idn));
    const candidate = { ...pupil, id: "candidate" };
    for (const m of findLikelyDuplicates(candidate, existing)) {
      const s = existing.find((x) => x.id === m.id);
      if (s) matches.add(label(s));
    }
    const pool = earlier.map((e) => ({ ...e.p, id: e.id }));
    for (const m of findLikelyDuplicates(candidate, pool)) {
      const e = earlier.find((x) => x.id === m.id);
      if (e) matches.add(`#${e.line}`);
    }
    for (const e of earlier) {
      if ((pupil.permNumber && plain(e.p.permNumber) === plain(pupil.permNumber)) || (pupil.idNumber && plain(e.p.idNumber) === plain(pupil.idNumber))) matches.add(`#${e.line}`);
    }
    earlier.push({ id: `line-${line}`, line, p: pupil });
    return {
      line, cells, status: matches.size ? "duplicate" : "ready", errors, matches: [...matches],
      pupil: { ...pupil, classId, academicYearId: year!.id, enrolledOn },
    };
  });
}

/** Pupils saved per server call: small enough to finish well inside a serverless time limit. */
export const IMPORT_CHUNK = 25;

/** A stable UUID for one row of one import, so a chunk sent twice (a retry) is not saved twice. */
export function rowId(key: string, line: number, kind: string): string {
  const h = createHash("sha256").update(`${key}:${line}:${kind}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Web enrolments use device tag W; phones are given A to V. */
const WEB_TAG = "W";

/**
 * The sync mutations (a pupil and their enrolment) for one chunk of checked rows. Each row is
 * checked again against the school as it is now; ids come from the import key and the row, so a
 * chunk sent twice saves nothing new.
 */
export function buildImport(d: Pick<SchoolData, "school" | "years" | "classes" | "students" | "enrolments">, siteId: string, key: string, rows: { line: number; pupil: NonNullable<PlannedRow["pupil"]> }[], today: string) {
  const numbers = d.students.map((s) => s.studentNumber);
  const have = new Set(d.enrolments.map((e) => e.id));
  const muts: Mutation[] = [];
  const lines: number[] = [];
  const skipped: { line: number; error: string }[] = [];
  let already = 0;
  for (const { line, pupil: p } of rows) {
    const studentId = rowId(key, line, "student");
    const enrolmentId = rowId(key, line, "enrolment");
    // Saved by an earlier attempt. (A pupil saved without its enrolment is completed: its mutation replays as a duplicate.)
    if (have.has(enrolmentId)) { already++; continue; }
    const cls = d.classes.find((c) => c.id === p.classId && !c.voidedAt);
    const year = currentYear(d, p.enrolledOn);
    if (!d.school || !cls || !year || cls.academicYearId !== year.id || p.enrolledOn > today) { skipped.push({ line, error: "classChanged" }); continue; }
    const fields = {
      studentNumber: nextStudentNumber(d.school.code, Number(year.startsOn.slice(0, 4)), WEB_TAG, numbers),
      firstName: p.firstName, lastName: p.lastName, postName: p.postName, sex: p.sex,
      dateOfBirth: p.dateOfBirth, birthYearEstimate: p.birthYearEstimate,
      guardianName: p.guardianName, guardianPhone: p.guardianPhone, village: p.village,
      idNumber: p.idNumber, permNumber: p.permNumber, birthPlace: p.birthPlace,
    };
    const ok = studentSchema.safeParse(fields);
    const long = (["firstName", "lastName", "postName", "guardianName", "village"] as const).find((k) => fields[k].length > 80) ?? (fields.guardianPhone.length > 20 ? "guardianPhone" : null);
    if (long) { skipped.push({ line, error: `invalid:${long}` }); continue; }
    if (!ok.success || (!p.dateOfBirth && p.birthYearEstimate === null)) { skipped.push({ line, error: `invalid:${String(ok.error?.issues[0]?.path[0] ?? "dateOfBirth")}` }); continue; }
    numbers.push(fields.studentNumber);
    lines.push(line);
    muts.push(
      insertMutation("school.student", siteId, fields, { mutationId: rowId(key, line, "m-student"), recordId: studentId }),
      insertMutation("school.enrolment", siteId, { studentId, classId: cls.id, academicYearId: year.id, enrolledOn: p.enrolledOn, leftOn: null, status: "active" }, { mutationId: rowId(key, line, "m-enrolment"), recordId: enrolmentId }),
    );
  }
  return { muts, lines, already, skipped };
}
