import { describe, expect, test } from "vite-plus/test";
import type { CleanDataset } from "../api/types.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import {
  CSV_COLUMNS,
  exportContent,
  exportFileName,
  toCsv,
  toCsvCell,
  toJson,
  UTF8_BOM,
} from "./exportData.ts";

const dataset = toCleanDataset(generateMockDataset("demo_user"));

/** 最小 RFC 4180 解析器，只用來驗證輸出能被正確讀回。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else {
      cell += char;
    }
  }
  return rows;
}

describe("toCsvCell", () => {
  test.each([
    [null, ""],
    [true, "true"],
    [1234, "1234"],
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line1\nline2", '"line1\nline2"'],
  ])("%j → %j", (value, expected) => {
    expect(toCsvCell(value)).toBe(expected);
  });

  test.each(["=SUM(A1)", "+1", "-1", "@mock_reader 你好", "\tcmd"])(
    "neutralises a leading formula character in %j",
    (value) => {
      expect(toCsvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  test("does not touch numbers even when negative", () => {
    expect(toCsvCell(-1)).toBe("-1");
  });
});

describe("toCsv", () => {
  const csv = toCsv(dataset);

  test("starts with a UTF-8 BOM and uses CRLF line endings", () => {
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "")).not.toMatch(/\r/);
  });

  test("has a header plus one row per post, each marked synthetic", () => {
    const rows = parseCsv(csv.slice(UTF8_BOM.length));
    const [header, ...body] = rows;

    expect(header).toEqual(["data_source", ...CSV_COLUMNS.map(([name]) => name)]);
    expect(body).toHaveLength(dataset.posts.length);
    const synthetic = header.indexOf("is_synthetic");
    const source = header.indexOf("data_source");
    expect(body.every((row) => row[synthetic] === "true")).toBe(true);
    expect(body.every((row) => row[source] === "mock_dataset")).toBe(true);
    expect(body.every((row) => row.length === header.length)).toBe(true);
  });

  test("round-trips multi-line content and leaves hidden views empty", () => {
    const rows = parseCsv(csv.slice(UTF8_BOM.length));
    const [header, ...body] = rows;
    const content = header.indexOf("content");
    const views = header.indexOf("views_count");

    dataset.posts.forEach((post, i) => {
      expect(body[i][content]).toBe(post.content);
      expect(body[i][views]).toBe(post.views_count === null ? "" : String(post.views_count));
    });
    expect(dataset.posts.some((p) => p.content.includes("\n"))).toBe(true);
    expect(dataset.posts.some((p) => p.views_count === null)).toBe(true);
  });

  test("keeps Chinese text intact", () => {
    expect(csv).toContain(dataset.posts[0].content.split("\n")[0]);
  });

  test("writes only the header for an empty dataset", () => {
    const empty: CleanDataset = { ...dataset, posts: [] };
    expect(parseCsv(toCsv(empty).slice(UTF8_BOM.length))).toHaveLength(1);
  });
});

describe("toJson", () => {
  test("round-trips the full dataset including analysis results", () => {
    const parsed = JSON.parse(toJson(dataset));
    expect(parsed).toEqual(JSON.parse(JSON.stringify(dataset)));
    expect(parsed.posts.every((p: { is_synthetic: boolean }) => p.is_synthetic)).toBe(true);
    expect(parsed).toHaveProperty("stats.weekday_hour");
  });
});

describe("exportFileName / exportContent", () => {
  test("names files with mock, username and post count", () => {
    expect(exportFileName(dataset, "csv")).toBe("threadsinsight-mock-demo_user-30posts.csv");
    expect(exportFileName(dataset, "json")).toBe("threadsinsight-mock-demo_user-30posts.json");
  });

  test("dispatches to the right serializer", () => {
    expect(exportContent(dataset, "csv")).toBe(toCsv(dataset));
    expect(exportContent(dataset, "json")).toBe(toJson(dataset));
  });
});
