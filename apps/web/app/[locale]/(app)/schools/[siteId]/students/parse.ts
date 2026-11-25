/**
 * Reads pasted pupil lines for the "whole class" enrolment form. One pupil per line, columns
 * separated by a tab (copied from a spreadsheet), a semicolon or a comma:
 *
 *   NOM ; Post-nom ; Prénom ; Sexe ; Naissance [; Parent ; Téléphone]
 *
 * Sexe: F / Fille / Girl, or G / M / Garçon / Boy. Naissance: a year (2018), dd/mm/yyyy or yyyy-mm-dd.
 * A first line that looks like a header (contains "nom"/"name") is skipped.
 */

export interface PupilLine {
  line: number;
  firstName: string;
  lastName: string;
  postName: string;
  sex: "F" | "M";
  dateOfBirth: string | null;
  birthYearEstimate: number | null;
  guardianName: string;
  guardianPhone: string;
  village: string;
}

export type ParsedLine = PupilLine | { line: number; error: string };

const SEX: Record<string, "F" | "M"> = { f: "F", fille: "F", girl: "F", g: "M", m: "M", garcon: "M", "garçon": "M", boy: "M", b: "M" };

function birth(raw: string): { dateOfBirth: string | null; birthYearEstimate: number | null } | null {
  const s = raw.trim();
  if (/^\d{4}$/.test(s)) return { dateOfBirth: null, birthYearEstimate: Number(s) };
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return valid(s);
  return null;
}

function valid(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? { dateOfBirth: iso, birthYearEstimate: null } : null;
}

export function parsePupilLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((l, i) => ({ l: l.trim(), line: i + 1 })).filter((r) => r.l !== "");
  const out: ParsedLine[] = [];
  rows.forEach(({ l, line }, idx) => {
    const sep = l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",";
    const c = l.split(sep).map((x) => x.trim());
    if (idx === 0 && /\b(nom|name|surname)\b/i.test(l) && !birth(c[4] ?? "")) return; // header row
    if (c.length < 5) return void out.push({ line, error: "bulk_columns" });
    const [lastName, postName, firstName, sexRaw, birthRaw, guardianName = "", guardianPhone = ""] = c as [string, string, string, string, string, string?, string?];
    if (!lastName) return void out.push({ line, error: "invalid:lastName" });
    if (!firstName) return void out.push({ line, error: "invalid:firstName" });
    const sex = SEX[sexRaw.toLowerCase()];
    if (!sex) return void out.push({ line, error: "invalid:sex" });
    const b = birth(birthRaw);
    if (!b) return void out.push({ line, error: "invalid:dateOfBirth" });
    out.push({ line, lastName, postName, firstName, sex, ...b, guardianName, guardianPhone, village: "" });
  });
  return out;
}
