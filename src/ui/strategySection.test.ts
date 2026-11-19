import { describe, expect, test } from "vite-plus/test";
import type { StrategyResult } from "../api/types.ts";
import { summarizePosts } from "../analysis/metrics.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { renderReport } from "./report.ts";
import {
  aiStatusText,
  fallbackReason,
  renderAiStatus,
  renderStrategySection,
  sourceNote,
} from "./strategySection.ts";

const dataset = toCleanDataset(generateMockDataset("demo_user"));
const strategy = dataset.strategy;

describe("renderStrategySection", () => {
  test("lists three numbered insights with evidence and action", () => {
    const html = renderStrategySection(strategy);
    expect(html.match(/<li class="card strategy-card/g)).toHaveLength(3);
    expect(html).toContain("使用 hashtag 的貼文互動較高");
    expect(html).toContain("14 篇平均互動 1696。");
    expect(html).toContain("<span>建議</span>每篇加上 1–2 個 hashtag。");
  });

  test("mutes filler insights that only say the data is insufficient", () => {
    expect(renderStrategySection(strategy)).toContain('class="card strategy-card is-muted"');
  });

  test("shows the rewrite before and after, with the list of changes", () => {
    const html = renderStrategySection(strategy);
    expect(html).toContain("改寫範例：互動最低的貼文");
    expect(html).toContain("延伸閱讀：https://example.com/notes/16");
    expect(html).toContain("（連結放在第一則留言）");
    expect(html).toContain("<li>把外部連結移到第一則留言</li>");
    expect(html).not.toMatch(/href="https:\/\/example\.com/);
  });

  test("explains when no rewrite rule applies", () => {
    const html = renderStrategySection({ ...strategy, rewrite: null });
    expect(html).toContain("沒有適用的改寫規則");
  });

  test("states the source and shows a small-sample notice when present", () => {
    const html = renderStrategySection({
      ...strategy,
      notice: "樣本少於 10 篇，策略觀察僅供參考。",
    });
    expect(html).toContain("規則引擎");
    expect(html).toContain("不代表因果");
    expect(html).toContain("樣本少於 10 篇");
  });

  test("escapes every generated text", () => {
    const hostile: StrategyResult = {
      ...strategy,
      insights: strategy.insights.map((i) => ({ ...i, title: "<img src=x onerror=1>" })),
      rewrite: { ...strategy.rewrite!, after: "<script>x</script>" },
    };
    const html = renderStrategySection(hostile);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
  });
});

describe("sourceNote", () => {
  test("describes each source, naming the model for AI results", () => {
    expect(sourceNote({ source: "rule_engine" })).toContain("規則引擎");
    expect(sourceNote({ source: "llm", model: "claude-haiku-5-5" })).toContain("Claude Haiku 5.5");
    expect(sourceNote({ source: "llm", model: null })).toContain("AI 模型");
    expect(sourceNote({ source: "other" })).toBe("來源：other");
  });
});

describe("AI states", () => {
  test("pending state shows a live status and marks the section busy", () => {
    const html = renderStrategySection(strategy, "pending");
    expect(html).toContain('role="status"');
    expect(html).toContain("AI 深度建議產生中（Claude Haiku 5.5）");
    expect(html).toContain('aria-busy="true"');
  });

  test("settled state has no status line", () => {
    const html = renderStrategySection(strategy);
    expect(html).not.toContain('role="status"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('id="strategy"');
  });

  test("an AI result is labelled with its model and shows the AI rewrite", () => {
    const ai: StrategyResult = {
      ...strategy,
      source: "llm",
      model: "claude-haiku-5-5",
      insights: strategy.insights.map((i) => ({ ...i, category: "ai", lift: null })),
    };
    const html = renderStrategySection(ai);
    expect(html).toContain("由 Claude Haiku 5.5 依互動數據產生");
    expect(html).not.toContain("is-muted");
  });

  test("a fallback notice from the server is shown", () => {
    const html = renderStrategySection({
      ...strategy,
      notice: "AI 深度建議生成逾時，目前已顯示系統規則引擎產出之基礎策略觀察。",
    });
    expect(html).toContain("AI 深度建議生成逾時");
  });
});

test("the report renders the strategy section as pending until AI answers", () => {
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  expect(html).toContain("AI 深度建議產生中");
});

test("the report puts strategy right after the KPI cards, before the charts", () => {
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  const strategy = html.indexOf('id="strategy-title"');
  expect(html.indexOf('aria-label="總覽指標"')).toBeLessThan(strategy);
  expect(strategy).toBeLessThan(html.indexOf('id="charts-title"'));
});

test("the report header shows the AI status with a link to the strategy", () => {
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  expect(header).toContain('id="ai-report-status"');
  expect(header).toContain("AI 策略建議產生中");
  expect(header).toContain('href="#strategy"');
});

describe("source badge", () => {
  test("labels rule-engine results", () => {
    const html = renderStrategySection(strategy);
    expect(html).toContain('<span class="source-badge">規則引擎</span>');
    expect(html).not.toContain("is-ai");
  });

  test("labels AI results with the model and marks AI cards", () => {
    const ai: StrategyResult = {
      ...strategy,
      source: "llm",
      model: "claude-haiku-5-5",
      insights: strategy.insights.map((i) => ({ ...i, category: "ai", lift: null })),
    };
    const html = renderStrategySection(ai);
    expect(html).toContain('<span class="source-badge is-ai">AI · Claude Haiku 5.5</span>');
    expect(html.match(/strategy-card is-ai/g)).toHaveLength(3);
  });
});

describe("AI status line", () => {
  const ai: StrategyResult = { ...strategy, source: "llm", model: "claude-haiku-5-5" };

  test.each([
    ["pending", strategy, "AI 策略建議產生中（Claude Haiku 5.5）…"],
    ["settled", ai, "✓ AI 策略建議已完成（Claude Haiku 5.5）"],
  ] as const)("%s", (state, value, text) => {
    expect(aiStatusText(value, state)).toBe(text);
  });

  test.each([
    ["尚未啟用 AI 建議：可在上方…", "尚未設定 API 金鑰"],
    ["AI 建議無法產生：API 金鑰無效或沒有權限…", "API 金鑰無效或沒有權限"],
    ["AI 深度建議生成逾時…", "等候逾時"],
    ["AI 深度建議暫時無法產生…", "暫時無法產生"],
    [null, "暫時無法產生"],
  ])("fallback reason for %j", (notice, reason) => {
    expect(fallbackReason(notice)).toBe(reason);
    expect(aiStatusText({ ...strategy, notice }, "settled")).toContain(reason);
  });

  test("uses distinct styles for pending, done and fallback", () => {
    expect(renderAiStatus(strategy, "pending")).toContain("is-pending");
    expect(renderAiStatus(ai, "settled")).toContain("is-done");
    expect(renderAiStatus(strategy, "settled")).toContain("is-fallback");
    expect(renderAiStatus(strategy, "settled")).toContain('role="status"');
  });
});
