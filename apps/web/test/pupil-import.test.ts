import { describe, expect, it } from "vitest";
import { classCode, decodeCsv, detectDelimiter, matchClass, parseCsv, planImport, readClass, readDate, readPupilFile, templateCsv } from "../lib/pupil-import";

const TODAY = "2026-11-26";

describe("decoding and delimiters", () => {
  it("reads UTF-8 (with BOM) and falls back to Windows-1252 for Excel's default CSV", () => {
    const utf8 = new TextEncoder().encode("\uFEFFNOM;Prénom\nKABEYA;Benoît\n");
    expect(decodeCsv(utf8)).toEqual({ text: "NOM;Prénom\nKABEYA;Benoît\n", encoding: "utf-8" });
    // "Prénom;Benoît" in Windows-1252: é = 0xE9, î = 0xEE
    const latin = Uint8Array.from([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d, 0x3b, 0x42, 0x65, 0x6e, 0x6f, 0xee, 0x74]);
    expect(decodeCsv(latin)).toEqual({ text: "Prénom;Benoît", encoding: "windows-1252" });
  });
  it("detects semicolon, comma and tab, ignoring delimiters inside quotes", () => {
    expect(detectDelimiter("NOM;Prénom;Sexe\n")).toBe(";");
    expect(detectDelimiter('SURNAME,First name,"Sex (F, B)"\n')).toBe(",");
    expect(detectDelimiter('"A;B;C",x,y\n')).toBe(",");
    expect(detectDelimiter("NOM\tPrénom\n")).toBe("\t");
  });
  it("parses quoted cells with delimiters, doubled quotes and line breaks; skips blank rows", () => {
    const rows = parseCsv('a;"b;c";"say ""hi"""\r\n;;\r\n"multi\nline";x\n', ";");
    expect(rows).toEqual([{ line: 1, cells: ["a", "b;c", 'say "hi"'] }, { line: 3, cells: ["multi line", "x"] }]);
  });
});

describe("dates and classes", () => {
  it("reads day-first dates, ISO dates and 2-digit years; month-first only when it must be", () => {
    expect(readDate("15/03/2018", 2026)).toBe("2018-03-15");
    expect(readDate("05/03/2018", 2026)).toBe("2018-03-05");
    expect(readDate("3/15/2018", 2026)).toBe("2018-03-15");
    expect(readDate("15-03-18", 2026)).toBe("2018-03-15");
    expect(readDate("2018-03-15", 2026)).toBe("2018-03-15");
    expect(readDate("31/02/2018", 2026)).toBeNull();
    expect(readDate("mars 2018", 2026)).toBeNull();
  });
  it("reads class names the way schools write them", () => {
    expect(readClass("1A")).toEqual({ level: 1, section: "A", shift: null });
    expect(readClass("1re année A")).toEqual({ level: 1, section: "A", shift: null });
    expect(readClass("1ère A")).toEqual({ level: 1, section: "A", shift: null });
    expect(readClass("3e B après-midi")).toEqual({ level: 3, section: "B", shift: "afternoon" });
    expect(readClass("Year 2 C morning")).toEqual({ level: 2, section: "C", shift: "morning" });
    expect(readClass("4")).toEqual({ level: 4, section: null, shift: null });
  });
  const cls = (id: string, level: number, section: string, shift: "morning" | "afternoon" = "morning", academicYearId = "y1") => ({ id, level, section, shift, academicYearId, voidedAt: null });
  const classes = [cls("c1a", 1, "A"), cls("c1b", 1, "B"), cls("c2a-m", 2, "A"), cls("c2a-pm", 2, "A", "afternoon"), cls("c3a", 3, "A"), cls("old", 4, "A", "morning", "y0")];
  it("matches a class in the year, allowing a missing section or shift when only one fits", () => {
    expect(matchClass("1B", classes, "y1")).toEqual({ id: "c1b" });
    expect(matchClass("3", classes, "y1")).toEqual({ id: "c3a" });
    expect(matchClass("1", classes, "y1")).toEqual({ error: "classAmbiguous" });
    expect(matchClass("2A", classes, "y1")).toEqual({ error: "classAmbiguous" });
    expect(matchClass("2A après-midi", classes, "y1")).toEqual({ id: "c2a-pm" });
    expect(matchClass("4A", classes, "y1")).toEqual({ error: "classUnknown" });
    expect(matchClass("CP", classes, "y1")).toEqual({ error: "classUnknown" });
  });
  it("gives short codes, with the shift only when both shifts have the class", () => {
    expect(classCode(classes[0]!, classes, "fr")).toBe("1A");
    expect(classCode(classes[3]!, classes, "fr")).toBe("2A après-midi");
    expect(classCode(classes[2]!, classes, "en")).toBe("2A morning");
  });
});

describe("readPupilFile", () => {
  it("reads the French and English templates back, skipping the example rows", () => {
    for (const lang of ["fr", "en"] as const) {
      const f = readPupilFile(decodeCsv(new TextEncoder().encode(templateCsv(lang))).text, TODAY);
      expect(f.missing).toEqual([]);
      expect(f.ignored).toEqual([]);
      expect(Object.keys(f.columns)).toHaveLength(13);
      expect(f.examples).toBe(2);
      expect(f.rows).toEqual([]);
    }
  });
  it("finds headers in any order and language, below a title line, and reports every problem in a row", () => {
    const text = [
      "Liste des élèves EP Kiabukwa 2026-2027;;;;",
      "Prénom;NOM;Sexe;Naissance;Classe;Téléphone;N° perm.;Remarque",
      "Marie;KABEYA;F;2019;1A;+243 970 000 001;P-001;ok",
      "Patrick;ILUNGA;garçon;12/03/2018;1A;;;",
      ";MUKENDI;X;31/02/2018;2A;2,43971E+11;;",
      "Esther;BANZA;Fille;2030;1A;;;",
    ].join("\n");
    const f = readPupilFile(text, TODAY);
    expect(f.headers[0]).toBe("Prénom");
    expect(f.ignored).toEqual(["Remarque"]);
    expect(f.rows).toHaveLength(4);
    expect(f.rows[0]).toMatchObject({ line: 3, errors: [], pupil: { firstName: "Marie", lastName: "KABEYA", sex: "F", birthYearEstimate: 2019, permNumber: "P-001", classText: "1A" } });
    expect(f.rows[1]).toMatchObject({ errors: [], pupil: { sex: "M", dateOfBirth: "2018-03-12" } });
    expect(f.rows[2]!.errors).toEqual(["firstName", "sex", "birth", "phoneExcel"]);
    expect(f.rows[3]!.errors).toEqual(["birthFuture"]);
  });
  it("says which required columns are missing", () => {
    const f = readPupilFile("Nom,Prénom,Classe\nKABEYA,Marie,1A\n", TODAY);
    expect(f.missing).toEqual(["sex", "birth"]);
  });
});

describe("planImport", () => {
  const years = [{ id: "y0", startsOn: "2025-09-01", endsOn: "2026-07-02", voidedAt: null }, { id: "y1", startsOn: "2026-09-01", endsOn: "2027-07-02", voidedAt: null }];
  const classes = [
    { id: "c1a", academicYearId: "y1", level: 1, section: "A", shift: "morning", voidedAt: null },
    { id: "c2a", academicYearId: "y1", level: 2, section: "A", shift: "morning", voidedAt: null },
    { id: "old1a", academicYearId: "y0", level: 1, section: "A", shift: "morning", voidedAt: null },
  ];
  const students = [{ id: "s1", studentNumber: "KIA-2026-W0001", firstName: "Marie", lastName: "KABEYA", postName: "", sex: "F", dateOfBirth: null, birthYearEstimate: 2019, guardianPhone: "", permNumber: "", idNumber: "ID-9", voidedAt: null }];
  const d = { years, classes, students } as any;
  const file = readPupilFile([
    "NOM;Prénom;Sexe;Naissance;Classe;Date d'inscription;N° ID",
    "KABEYA;Marie;F;2019;1A;;",
    "ILUNGA;Patrick;G;2018;;;",
    "NGOY;Sarah;F;2017;1A;01/03/2026;",
    "BANZA;Esther;F;2018;5A;;",
    "ILUNGA;Patrick;G;2018;2A;;",
    "TSHIBANDA;Paul;G;2018;2A;;ID-9",
  ].join("\n"), TODAY);
  const opts = { defaultClassId: "c2a", defaultEnrolledOn: "2026-09-01", today: TODAY };

  it("resolves classes and dates, uses the defaults, and flags duplicates in the school and in the file", () => {
    const plan = planImport(d, file, opts);
    expect(plan.map((r) => [r.line, r.status, r.errors.join(","), r.pupil?.classId ?? ""])).toEqual([
      [2, "duplicate", "", "c1a"],
      [3, "ready", "", "c2a"],
      [4, "ready", "", "old1a"],
      [5, "error", "classUnknown", ""],
      [6, "duplicate", "", "c2a"],
      [7, "duplicate", "", "c2a"],
    ]);
    expect(plan[0]!.matches).toEqual(["KABEYA Marie (KIA-2026-W0001)"]);
    expect(plan[4]!.matches).toEqual(["#3"]);
    expect(plan[5]!.matches).toEqual(["KABEYA Marie (KIA-2026-W0001)"]);
    expect(plan[1]!.pupil!.enrolledOn).toBe("2026-09-01");
  });
  it("refuses an enrolment date outside every school year, and a default class from another year", () => {
    const plan = planImport(d, readPupilFile("NOM;Prénom;Sexe;Naissance;Date d'inscription\nA;B;F;2019;15/08/2026\nC;D;F;2019;\n", TODAY), { ...opts, defaultClassId: "old1a" });
    expect(plan.map((r) => r.errors)).toEqual([["enrolledNoYear"], ["classOtherYear"]]);
  });
  it("does not match pupils this import already created (a resumed import)", () => {
    const plan = planImport(d, file, opts, new Set(["s1"]));
    expect(plan[0]!.status).toBe("ready");
  });
});
