/**
 * 產生跨語言一致性用的黃金檔：shared/fixtures/mock-golden.json
 * TS（src/mock）與 Python（api/threadsinsightapi）的測試都必須與此檔完全相符。
 *
 * 只有在「刻意」改變產生器輸出時才重新執行：
 *   vpx ./scripts/generate-mock-golden.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateMockDataset } from "../src/mock/index.ts";
import { GOLDEN_CASES, GOLDEN_NOW } from "../src/mock/goldenCases.ts";

const outPath = fileURLToPath(new URL("../shared/fixtures/mock-golden.json", import.meta.url));

const cases = GOLDEN_CASES.map(({ input, count }) => ({
  input,
  count,
  dataset: generateMockDataset(input, { count, now: () => new Date(GOLDEN_NOW) }),
}));

writeFileSync(outPath, `${JSON.stringify({ now: GOLDEN_NOW, cases }, null, 2)}\n`);
process.stdout.write(`wrote ${cases.length} cases to ${outPath}\n`);
