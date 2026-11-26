import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBook, checkClass, checkTerm, checkYear, threeTerms } from "@/app/[locale]/(app)/schools/[siteId]/setup/checks";

const row = <T extends object>(x: T, id = Math.random().toString(36).slice(2)) => ({ id, voidedAt: null, ...x }) as any;

describe("setup form field names (item 1: Section was always refused)", () => {
  it("no hidden field of the setup page shares a name with a field people type in", () => {
    const src = readFileSync(fileURLToPath(new URL("../app/[locale]/(app)/schools/[siteId]/setup/page.tsx", import.meta.url)), "utf8");
    const hidden = new Set<string>();
    // The shared hidden() helper and the hidden={{…}} maps every Setup form carries.
    const helper = /const hidden = \(section[\s\S]*?\n  \);/.exec(src)?.[0] ?? "";
    for (const m of helper.matchAll(/type="hidden" name="([a-zA-Z]+)"/g)) hidden.add(m[1]!);
    for (const m of src.matchAll(/hidden=\{\{([^}]*)\}\}/g)) for (const part of m[1]!.split(",")) hidden.add(part.split(":")[0]!.trim());
    expect(hidden.has("returnTo")).toBe(true);
    const visible = new Set<string>();
    for (const m of src.matchAll(/<(?:input|select|textarea)(?![^>]*type="hidden")[^>]*\sname="([a-zA-Z]+)"/g)) visible.add(m[1]!);
    expect(visible.has("section")).toBe(true);
    expect([...visible].filter((n) => hidden.has(n))).toEqual([]);
  });
});

describe("class checks", () => {
  const year = "00000000-0000-4000-8000-000000000001";
  const base = { academicYearId: year, level: 1, section: "A", shift: "morning" as const, classroomId: null };
  it("accepts one or two letters and refuses digits or longer text", () => {
    expect(checkClass(base, [])).toBeNull();
    expect(checkClass({ ...base, section: "BC" }, [])).toBeNull();
    expect(checkClass({ ...base, section: "1" }, [])?.code).toBe("section");
    expect(checkClass({ ...base, section: "CLASSES" }, [])?.code).toBe("section");
  });
  it("refuses a duplicate class, but an edited class never clashes with itself", () => {
    const existing = row(base, "c1");
    expect(checkClass(base, [existing])?.code).toBe("classTaken");
    expect(checkClass(base, [existing], "c1")).toBeNull();
    expect(checkClass({ ...base, section: "B" }, [existing], "c1")).toBeNull();
  });
});

describe("editing years, terms and receipt books", () => {
  const y = row({ label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" }, "y1");
  const t1 = row({ academicYearId: "y1", number: 1, startsOn: "2026-09-01", endsOn: "2026-12-20" }, "t1");
  const t2 = row({ academicYearId: "y1", number: 2, startsOn: "2027-01-04", endsOn: "2027-03-31" }, "t2");

  it("a year can be edited without clashing with itself, but not cut off one of its terms", () => {
    expect(checkYear({ label: "2026-27", startsOn: "2026-09-01", endsOn: "2027-07-02" }, [y], "y1", [t1, t2])).toBeNull();
    expect(checkYear({ label: "2026-27", startsOn: "2026-10-01", endsOn: "2027-07-02" }, [y], "y1", [t1, t2])?.code).toBe("yearCutsTerm");
    expect(checkYear({ label: "x", startsOn: "2026-09-01", endsOn: "2027-07-02" }, [y])?.code).toBe("yearOverlap");
  });
  it("a term keeps its own number when edited, and terms cannot overlap", () => {
    expect(checkTerm({ academicYearId: "y1", number: 1, startsOn: "2026-09-02", endsOn: "2026-12-19" }, [y], [t1, t2], "t1")).toBeNull();
    expect(checkTerm({ academicYearId: "y1", number: 2, startsOn: "2026-09-02", endsOn: "2026-12-19" }, [y], [t1, t2], "t1")?.code).toBe("termTaken");
    expect(checkTerm({ academicYearId: "y1", number: 3, startsOn: "2027-03-01", endsOn: "2027-06-30" }, [y], [t1, t2])?.code).toBe("termOverlap");
  });
  it("a receipt book can shrink only while it still holds the receipts already used", () => {
    const book = row({ firstNumber: 1, lastNumber: 100, assignedTo: "u1" }, "b1");
    const pays = [row({ receiptNumber: 80 })];
    expect(checkBook({ firstNumber: 1, lastNumber: 90 }, [book], "b1", pays)).toBeNull();
    expect(checkBook({ firstNumber: 1, lastNumber: 50 }, [book], "b1", pays)?.code).toBe("bookCutsReceipts");
    expect(checkBook({ firstNumber: 1, lastNumber: 50 }, [book])?.code).toBe("bookOverlap");
  });
});

describe("threeTerms (item 3a: a year with no trimesters)", () => {
  it("splits a year into three back-to-back trimesters covering every day", () => {
    const t = threeTerms({ startsOn: "2026-09-01", endsOn: "2027-07-02" });
    expect(t.map((x) => x.number)).toEqual([1, 2, 3]);
    expect(t[0]!.startsOn).toBe("2026-09-01");
    expect(t[2]!.endsOn).toBe("2027-07-02");
    const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect(t[1]!.startsOn).toBe(next(t[0]!.endsOn));
    expect(t[2]!.startsOn).toBe(next(t[1]!.endsOn));
  });
});
