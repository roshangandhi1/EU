import { describe, expect, it } from "vitest";
import { diffKeys } from "@eu/core/i18n";
import { strings } from "../src/i18n";

describe("forestry strings", () => {
  it("nest cleanly and match between English and French", () => {
    expect(diffKeys(strings.en, strings.fr)).toEqual([]);
  });
});
