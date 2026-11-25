import { describe, expect, it } from "vitest";
import { assemble, INDICATORS, totals } from "../lib/indicator-defs";

describe("programme dashboard", () => {
  it("lists all 13 Annex III indicators and their caps add to the contract ceiling", () => {
    expect(INDICATORS.map((i) => i.code)).toHaveLength(13);
    for (const i of INDICATORS) expect(i.capEur).toBe(i.unitEur * i.target2030);
  });

  it("values measured indicators at the unit rate, capped at the maximum", () => {
    const rows = assemble({ "2.2.1": { value: 39.28 }, "1.1.1": { value: 200 } });
    const bamboo = rows.find((r) => r.code === "2.2.1")!;
    expect(bamboo.status).toBe("live");
    expect(bamboo.valueEur).toBe(117_840);
    expect(rows.find((r) => r.code === "1.1.1")!.valueEur).toBe(1_848_000);
  });

  it("explains indicators the app cannot count yet", () => {
    const rows = assemble({});
    const status = (c: string) => rows.find((r) => r.code === c)!.status;
    expect(status("1.2.3")).toBe("awaiting_api");
    expect(status("3.1.4")).toBe("parked");
    expect(status("3.2.2")).toBe("awaiting_module");
    expect(status("4.1.1")).toBe("manual");
    expect(status("1.1.1")).toBe("awaiting_module");
    expect(totals(rows).earned).toBe(0);
  });
});
