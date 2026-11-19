import { describe, expect, test } from "vite-plus/test";
import type { NlpAnalysis } from "../api/types.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { renderAttributionSection, topicLabel } from "./attributionSection.ts";
import { SMALL_SAMPLE_NOTE } from "./notes.ts";

const nlp = toCleanDataset(generateMockDataset("demo_user")).nlp;

describe("renderAttributionSection", () => {
  test("renders one card per group in high/medium/low order", () => {
    const html = renderAttributionSection(nlp, false);
    const titles = [...html.matchAll(/class="chart-title">([^<]+)</g)].map((m) => m[1]);
    expect(titles).toEqual(["高互動組", "中互動組", "低互動組"]);
    expect(html).toContain("共 9 篇，抽樣 5 篇");
  });

  test("shows keywords, structure rates and observations", () => {
    const html = renderAttributionSection(nlp, false);
    expect(html).toContain("high詞");
    expect(html).toContain("<dt>含提問</dt>");
    expect(html).toContain("<dd>30%</dd>");
    expect(html).toContain("high 組的觀察。");
    expect(html).toContain("主題組成</span>觀點 5");
  });

  test("states the method and that observations are correlational", () => {
    expect(renderAttributionSection(nlp, false)).toContain("不代表因果");
  });

  test("adds the small-sample note only when flagged", () => {
    expect(renderAttributionSection(nlp, true)).toContain(SMALL_SAMPLE_NOTE);
    expect(renderAttributionSection(nlp, false)).not.toContain(SMALL_SAMPLE_NOTE);
  });

  test("marks an empty group as insufficient instead of failing", () => {
    const twoPosts = toCleanDataset(generateMockDataset("demo_user", { count: 2 })).nlp;
    const html = renderAttributionSection(twoPosts, true);
    expect(html).toContain("樣本不足：此組沒有貼文，略過歸因。");
  });

  test("explains when a group has no distinctive keywords", () => {
    const noTerms: NlpAnalysis = {
      ...nlp,
      groups: nlp.groups.map((g) => ({ ...g, keywords: [] })),
    };
    expect(renderAttributionSection(noTerms, false)).toContain("沒有此組特有的詞");
  });

  test("escapes observations and keywords", () => {
    const hostile: NlpAnalysis = {
      ...nlp,
      groups: nlp.groups.map((g) => ({
        ...g,
        keywords: [{ term: "<b>x</b>", weight: 1 }],
        observations: ["<script>alert(1)</script>"],
      })),
    };
    const html = renderAttributionSection(hostile, false);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
  });
});

test("topicLabel translates known topics and passes others through", () => {
  expect(topicLabel("career")).toBe("職場");
  expect(topicLabel("other")).toBe("其他");
  expect(topicLabel("unknown")).toBe("unknown");
});
