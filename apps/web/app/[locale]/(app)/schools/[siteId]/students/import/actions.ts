"use server";
import { revalidatePath } from "next/cache";
import { can, firstRejection, push, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { errorText } from "../../../text";
import { buildImport, IMPORT_CHUNK as CHUNK, planImport, readPupilFile, type ImportField, type ImportPupil, type PlannedRow } from "@/lib/pupil-import";


type Tr = ReturnType<typeof trFor>;

/** One sentence for a row problem code ("classUnknown", "tooLong:lastName"...). */
function problemText(code: string, tr: Tr, classText: string): string {
  const [k, detail] = code.split(":");
  if (k === "tooLong") return tr("pimport.err.tooLong", { field: tr(`pimport.field.${detail}`) });
  return tr(`pimport.err.${k}`, { value: classText });
}

export interface PreviewRow {
  line: number;
  cells: string[];
  status: PlannedRow["status"];
  /** Problems, already in the screen's language. */
  problems: string[];
  matches: string[];
  pupil?: PlannedRow["pupil"];
  name: string;
  birth: string;
  sex: "F" | "M" | "";
  classLabel: string;
}

export interface Preview {
  error?: string;
  headers: string[];
  delimiter: string;
  ignored: string[];
  missing: string[];
  examples: number;
  tooMany: boolean;
  rows: PreviewRow[];
}

const name = (p?: Pick<ImportPupil, "firstName" | "lastName" | "postName">) => (p ? [p.lastName.toUpperCase(), p.postName, p.firstName].filter(Boolean).join(" ") : "");

/** Reads the file and checks every row against the school. Nothing is saved. */
export async function previewImport(input: { locale: string; siteId: string; text: string; defaultClassId: string; defaultEnrolledOn: string }): Promise<Preview> {
  const { me, locale } = await signedIn(input.locale);
  const tr = trFor(locale);
  const empty: Preview = { headers: [], delimiter: ";", ignored: [], missing: [], examples: 0, tooMany: false, rows: [] };
  if (!can(me, "student.write", input.siteId) || !can(me, "enrolment.write", input.siteId)) return { ...empty, error: errorText("forbidden", tr) };
  const d = await schoolFor(me, input.siteId);
  const date = today();
  const file = readPupilFile(input.text, date);
  const base = { ...empty, headers: file.headers, delimiter: file.delimiter, ignored: file.ignored, examples: file.examples, tooMany: file.tooMany };
  if (file.headers.length === 0) return { ...base, error: tr("pimport.noHeader") };
  if (file.missing.length) return { ...base, missing: file.missing.map((f: ImportField) => tr(`pimport.field.${f}`)) };
  if (file.rows.length === 0) return { ...base, error: tr("pimport.noRows") };
  const plan = planImport(d, file, { defaultClassId: input.defaultClassId, defaultEnrolledOn: input.defaultEnrolledOn, today: date });
  const classById = new Map(d.classes.map((c) => [c.id, c]));
  const levelName = (n: number) => (n === 1 ? tr("levelFirst") : tr("levelName", { n }));
  const rows = plan.map((r): PreviewRow => {
    const p = r.pupil ?? file.rows.find((x) => x.line === r.line)?.pupil;
    const c = r.pupil ? classById.get(r.pupil.classId) : undefined;
    return {
      line: r.line, cells: r.cells, status: r.status, matches: r.matches, pupil: r.pupil,
      problems: r.errors.map((e) => problemText(e, tr, p?.classText ?? "")),
      name: name(p), sex: p && !r.errors.some((e) => e.startsWith("sex")) ? p.sex : "",
      birth: p?.dateOfBirth ?? (p?.birthYearEstimate ? String(p.birthYearEstimate) : ""),
      classLabel: c ? `${levelName(c.level)} ${c.section} · ${tr(`shift.${c.shift}`)}` : p?.classText ?? "",
    };
  });
  return { ...base, rows };
}

export interface CommitResult {
  error?: string;
  imported: number;
  /** Rows of this chunk already saved by an earlier attempt. */
  already: number;
  skipped: { line: number; reason: string }[];
}

/**
 * Saves one chunk of previewed rows (CHUNK pupils at most). Every row is checked again on the
 * server; a row that no longer passes is skipped with its reason, the others are saved.
 */
export async function commitImport(input: {
  locale: string;
  siteId: string;
  importKey: string;
  rows: { line: number; pupil: NonNullable<PlannedRow["pupil"]> }[];
}): Promise<CommitResult> {
  const { me, locale } = await signedIn(input.locale);
  const tr = trFor(locale);
  const out: CommitResult = { imported: 0, already: 0, skipped: [] };
  if (!can(me, "student.write", input.siteId) || !can(me, "enrolment.write", input.siteId)) return { ...out, error: errorText("forbidden", tr) };
  if (!/^[0-9a-f-]{36}$/i.test(input.importKey) || input.rows.length > CHUNK) return { ...out, error: errorText("invalid", tr) };
  const d = await schoolFor(me, input.siteId);
  if (!d.school) return { ...out, error: errorText("invalid", tr) };
  const { muts, lines, already, skipped } = buildImport(d, input.siteId, input.importKey, input.rows, today());
  out.already = already;
  for (const s of skipped) out.skipped.push({ line: s.line, reason: s.error === "classChanged" ? tr("pimport.err.classChanged") : errorText(s.error, tr) });
  if (muts.length) {
    const res = await push(me, muts);
    revalidatePath(`/${locale}/schools/${input.siteId}`, "layout");
    // Results come back in order: two per pupil (the pupil, then the enrolment).
    lines.forEach((line, i) => {
      const bad = firstRejection(res.slice(i * 2, i * 2 + 2));
      if (bad) out.skipped.push({ line, reason: errorText(bad, tr) });
      else out.imported++;
    });
  }
  return out;
}
