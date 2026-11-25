import { describe, expect, it } from "vitest";
import { errorText, plural, type Tr } from "@/app/[locale]/(app)/schools/text";
import { parsePupilLines } from "@/app/[locale]/(app)/schools/[siteId]/students/parse";
import { suggestReceipt } from "@/app/[locale]/(app)/schools/[siteId]/fees/receipts";
import { dependants } from "@/app/[locale]/(app)/schools/[siteId]/setup/dependants";
import { checkBook, checkTerm, checkYear, parseLatLng } from "@/app/[locale]/(app)/schools/[siteId]/setup/checks";
import { users } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { schoolsTables } from "@eu/schools";
import { BOYS, GIRLS, loadDemo } from "../lib/demo";
import { entities, permissions } from "../lib/registry";

/** A fake translator that shows which key and values were asked for. */
const tr: Tr = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const row = <T extends object>(x: T) => ({ id: Math.random().toString(36).slice(2), voidedAt: null, ...x }) as any;

describe("plural", () => {
  it("uses French rules (0 and 1 singular) and English rules (only 1 singular)", () => {
    expect(plural("fr", tr, "pupil.count", 0)).toMatch(/^pupil\.count_one/);
    expect(plural("fr", tr, "pupil.count", 1)).toMatch(/^pupil\.count_one/);
    expect(plural("fr", tr, "pupil.count", 2)).toMatch(/^pupil\.count_other/);
    expect(plural("en", tr, "pupil.count", 0)).toMatch(/^pupil\.count_other/);
    expect(plural("en", tr, "pupil.count", 1)).toContain('"n":1');
  });
});

describe("errorText", () => {
  it("maps known codes, field codes and dependency refusals", () => {
    expect(errorText("forbidden", tr)).toBe("common.forbidden");
    expect(errorText("site_taken", tr)).toBe("err.siteTaken");
    expect(errorText("invalid:amount:too_big", tr)).toBe('err.invalidField{"field":"fees.amount"}');
    expect(errorText("dep_class", tr, { count: "4" })).toBe('err.dep.class{"n":"4"}');
  });
  it("never shows a raw code: receipt-book codes get a receipt message, anything else a generic one", () => {
    expect(errorText("receipt_book_exhausted", tr)).toBe("err.receiptGeneric");
    expect(errorText("something_new", tr)).toBe("err.unknown");
  });
});

describe("parsePupilLines", () => {
  it("reads tab, semicolon and comma lines, skips a header and reports bad lines", () => {
    const out = parsePupilLines([
      "NOM;Post-nom;Prénom;Sexe;Naissance",
      "KABILA;Mwamba;Amani;F;2019",
      "ILUNGA\t\tPatrick\tG\t03/04/2018\tMaman Ilunga\t+243 970 000 000",
      "BANZA,,Esther,fille,2018-02-30",
      "MUKENDI;;Daniel;X;2019",
      "NGOY;Patrick",
    ].join("\n"));
    expect(out[0]).toMatchObject({ line: 2, lastName: "KABILA", firstName: "Amani", sex: "F", birthYearEstimate: 2019, dateOfBirth: null });
    expect(out[1]).toMatchObject({ line: 3, sex: "M", dateOfBirth: "2018-04-03", guardianPhone: "+243 970 000 000" });
    expect(out[2]).toEqual({ line: 4, error: "invalid:dateOfBirth" });
    expect(out[3]).toEqual({ line: 5, error: "invalid:sex" });
    expect(out[4]).toEqual({ line: 6, error: "bulk_columns" });
  });
});

describe("suggestReceipt", () => {
  const books = [row({ firstNumber: 2001, lastNumber: 2003, assignedTo: "u1" }), row({ firstNumber: 1001, lastNumber: 1100, assignedTo: "u2" }), row({ firstNumber: 3001, lastNumber: 3002, assignedTo: "u1" })];
  it("suggests the next number in the user's book, then moves to the next book, then null", () => {
    expect(suggestReceipt("u1", books, [])).toBe(2001);
    expect(suggestReceipt("u1", books, [row({ receiptNumber: 2001 }), row({ receiptNumber: 1050 })])).toBe(2002);
    expect(suggestReceipt("u1", books, [row({ receiptNumber: 2003 })])).toBe(3001);
    expect(suggestReceipt("u1", books, [row({ receiptNumber: 2003 }), row({ receiptNumber: 3001 }), row({ receiptNumber: 3002 })])).toBeNull();
    expect(suggestReceipt("u1", books, [row({ receiptNumber: 2001, voidedAt: "2026-11-01" })])).toBe(2001);
    expect(suggestReceipt("nobody", books, [])).toBeNull();
  });
});

describe("dependants", () => {
  const d = {
    enrolments: [row({ classId: "c1", leftOn: null }), row({ classId: "c1", leftOn: "2026-10-01" }), row({ classId: "c1", leftOn: null, voidedAt: "x" })],
    classes: [row({ id: "c1", academicYearId: "y1", classroomId: "r1" })], terms: [row({ academicYearId: "y1" })], feeItems: [row({ id: "f1", academicYearId: "y1", termId: "t1" })],
    payments: [row({ feeItemIds: ["f1"], receiptNumber: 1005 })], exemptions: [], receiptBooks: [row({ id: "b1", firstNumber: 1001, lastNumber: 1100 }), row({ id: "b2", firstNumber: 2001, lastNumber: 2100 })],
  } as any;
  it("counts what still uses a record, ignoring voided rows and pupils who left", () => {
    expect(dependants(d, "school.class", "c1", "2026-11-25")).toEqual({ kind: "class", count: 1 });
    expect(dependants(d, "school.academic_year", "y1", "2026-11-25")).toEqual({ kind: "year", count: 3 });
    expect(dependants(d, "school.term", "t1", "2026-11-25")).toEqual({ kind: "term", count: 1 });
    expect(dependants(d, "school.fee_item", "f1", "2026-11-25")).toEqual({ kind: "fee", count: 1 });
    expect(dependants(d, "school.receipt_book", "b1", "2026-11-25")).toEqual({ kind: "book", count: 1 });
    expect(dependants(d, "school.receipt_book", "b2", "2026-11-25")).toBeNull();
    expect(dependants(d, "school.classroom", "r1", "2026-11-25")).toEqual({ kind: "room", count: 1 });
  });
});

describe("setup checks", () => {
  const years = [row({ id: "y1", label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" })];
  it("academic years: end after start, no overlap", () => {
    expect(checkYear({ label: "X", startsOn: "2027-09-01", endsOn: "2027-08-01" } as any, years)?.code).toBe("endBeforeStart");
    expect(checkYear({ label: "X", startsOn: "2027-06-01", endsOn: "2028-07-01" } as any, years)?.code).toBe("yearOverlap");
    expect(checkYear({ label: "X", startsOn: "2027-09-01", endsOn: "2028-07-01" } as any, years)).toBeNull();
  });
  it("terms: inside the year and a number not yet used", () => {
    const terms = [row({ academicYearId: "y1", number: 1 })];
    expect(checkTerm({ academicYearId: "y1", number: 2, startsOn: "2026-08-01", endsOn: "2026-12-20" } as any, years, terms)?.code).toBe("termOutsideYear");
    expect(checkTerm({ academicYearId: "y1", number: 1, startsOn: "2026-09-01", endsOn: "2026-12-20" } as any, years, terms)?.code).toBe("termTaken");
    expect(checkTerm({ academicYearId: "y1", number: 2, startsOn: "2027-01-05", endsOn: "2027-03-30" } as any, years, terms)).toBeNull();
  });
  it("receipt books: in order, at most 10 000 receipts, no overlap", () => {
    const books = [row({ firstNumber: 1001, lastNumber: 1100 })];
    expect(checkBook({ firstNumber: 200, lastNumber: 100 }, books)?.code).toBe("bookOrder");
    expect(checkBook({ firstNumber: 1, lastNumber: 10_001 }, [])?.code).toBe("bookSize");
    expect(checkBook({ firstNumber: 1100, lastNumber: 1200 }, books)?.code).toBe("bookOverlap");
    expect(checkBook({ firstNumber: 1101, lastNumber: 1200 }, books)).toBeNull();
  });
  it("lat/lng: comma decimals, both or neither, inside the DRC", () => {
    expect(parseLatLng("-8,712", "24,79")).toEqual({ lat: -8.712, lng: 24.79 });
    expect(parseLatLng("", "")).toEqual({ lat: null, lng: null });
    expect((parseLatLng("-8.7", "") as any).code).toBe("latLngBoth");
    expect((parseLatLng("48.8", "2.3") as any).code).toBe("lat");
    expect((parseLatLng("-8.7", "2.3") as any).code).toBe("lng");
  });
});

describe("demo pupils", () => {
  it("girls' and boys' first-name lists do not overlap, so names match the pupil's sex", () => {
    expect(GIRLS.filter((g) => BOYS.includes(g))).toEqual([]);
    expect(GIRLS.length).toBe(BOYS.length);
  });
  it("every loaded demo pupil has a first name that matches their sex", async () => {
    const { db, close } = await createTestDb();
    try {
      const [u] = await (db as any).insert(users).values({ email: "admin@example.org", name: "Admin", passwordHash: "x" }).returning();
      await loadDemo({ db, user: { id: u.id, assignments: [{ role: "system_admin", scope: { type: "global" } }] }, deviceId: "web:test", permissions, entities } as any);
      const pupils: Array<{ firstName: string; sex: string }> = await (db as any).select().from(schoolsTables.schoolStudents);
      expect(pupils.length).toBeGreaterThan(0);
      for (const p of pupils) expect(p.sex === "F" ? GIRLS : BOYS).toContain(p.firstName);
    } finally {
      await close();
    }
  }, 60_000);
});
