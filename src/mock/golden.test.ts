import { describe, expect, test } from "vite-plus/test";
import golden from "../../shared/fixtures/mock-golden.json" with { type: "json" };
import { generateMockDataset } from "./generateMockDataset.ts";
import { GOLDEN_CASES, GOLDEN_NOW } from "./goldenCases.ts";

describe("cross-language golden file", () => {
  test("golden file covers exactly the declared cases", () => {
    expect(golden.now).toBe(GOLDEN_NOW);
    expect(golden.cases.map(({ input, count }) => ({ input, count }))).toEqual(GOLDEN_CASES);
  });

  test.each(golden.cases)("TS generator matches golden output for $input", (golden) => {
    const dataset = generateMockDataset(golden.input, {
      count: golden.count,
      now: () => new Date(GOLDEN_NOW),
    });
    expect(JSON.parse(JSON.stringify(dataset))).toEqual(golden.dataset);
  });
});
